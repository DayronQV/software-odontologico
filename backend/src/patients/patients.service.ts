import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { AlertRulesService } from '../catalog/alert-rules/alert-rules.service';
import { SettingsService } from '../catalog/settings/settings.service';
import { localDateAsUtc } from '../common/local-time';
import { pageArgs, pageResult } from '../common/pagination/paginate';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { isMinor, parseDateOnly } from './domain/age';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type { PatientInsuranceDto } from './dto/patient-parts.dto';
import type { PatientQueryDto } from './dto/patient-query.dto';
import type { UpdatePatientDto } from './dto/update-patient.dto';
import { cleanList } from './medical-history/medical-history.service';
import {
  PATIENT_INCLUDE,
  toPatientListItem,
  toPatientView,
  type PatientWithRelations,
} from './patient-view.mapper';

const ACTIVE_APPOINTMENT_STATUSES = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.WAITING_ROOM,
  AppointmentStatus.IN_ATTENTION,
];

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    private readonly alertRules: AlertRulesService,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(query: PatientQueryDto) {
    const args = pageArgs(query, 20);
    const where = this.buildSearch(query);
    const [total, patients, rules, today] = await Promise.all([
      this.prisma.db.patient.count({ where }),
      this.prisma.db.patient.findMany({
        where,
        include: PATIENT_INCLUDE,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: args.skip,
        take: args.take,
      }),
      this.alertRules.list(true),
      this.today(),
    ]);
    return pageResult(
      patients.map((p) => toPatientListItem(p, rules, today)),
      total,
      args,
    );
  }

  async findOne(id: string) {
    const patient = await this.prisma.db.patient.findUnique({
      where: { id },
      include: PATIENT_INCLUDE,
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return this.toView(patient);
  }

  // -------------------------------------------------------------- escritura

  /** Alta de la ficha única (RF-01). El tutor legal es obligatorio si es menor de edad. */
  async create(dto: CreatePatientDto, userId: string) {
    const today = await this.today();
    const birthDate = this.parseBirthDate(dto.birthDate, today);
    this.assertGuardian(birthDate, today, dto.guardian);
    const documentHash = await this.documentHashFor(dto.documentId);
    if (dto.insurance) await this.assertInsurance(dto.insurance);

    const patientId = await this.prisma.db.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          ...this.scalars(dto),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          sex: dto.sex,
          birthDate,
          documentHash,
        },
      });
      await tx.emergencyContact.create({ data: { patientId: patient.id, ...dto.emergencyContact } });
      if (dto.guardian) await tx.guardian.create({ data: { patientId: patient.id, ...dto.guardian } });
      if (dto.insurance) {
        await tx.patientInsurance.create({
          data: { patientId: patient.id, ...this.insuranceData(dto.insurance) },
        });
      }
      if (dto.medicalHistory) {
        await tx.medicalHistory.create({
          data: {
            patientId: patient.id,
            systemicDiseases: cleanList(dto.medicalHistory.systemicDiseases),
            drugAllergies: cleanList(dto.medicalHistory.drugAllergies),
            coagulopathies: cleanList(dto.medicalHistory.coagulopathies),
            surgicalHistory: dto.medicalHistory.surgicalHistory?.trim() || null,
            currentMedication: dto.medicalHistory.currentMedication?.trim() || null,
            anticoagulated: dto.medicalHistory.anticoagulated ?? false,
            updatedById: userId,
          },
        });
      }
      return patient.id;
    });
    return this.findOne(patientId);
  }

  async update(id: string, dto: UpdatePatientDto) {
    const existing = await this.prisma.db.patient.findUnique({
      where: { id },
      include: { guardian: true },
    });
    if (!existing) throw new NotFoundException('Paciente no encontrado');

    const today = await this.today();
    const birthDate = dto.birthDate ? this.parseBirthDate(dto.birthDate, today) : existing.birthDate;
    this.assertGuardian(birthDate, today, dto.guardian ?? existing.guardian);

    if (dto.active === false) await this.assertNoActiveAppointments(id);
    if (dto.insurance) await this.assertInsurance(dto.insurance);

    const documentChanged = dto.documentId !== undefined && dto.documentId !== existing.documentId;
    const documentHash = documentChanged ? await this.documentHashFor(dto.documentId, id) : undefined;

    await this.prisma.db.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id },
        data: {
          ...this.scalars(dto),
          birthDate: dto.birthDate ? birthDate : undefined,
          documentHash,
          active: dto.active,
        },
      });
      if (dto.emergencyContact) {
        await tx.emergencyContact.upsert({
          where: { patientId: id },
          create: { patientId: id, ...dto.emergencyContact },
          update: dto.emergencyContact,
        });
      }
      if (dto.guardian) {
        await tx.guardian.upsert({
          where: { patientId: id },
          create: { patientId: id, ...dto.guardian },
          update: dto.guardian,
        });
      }
      if (dto.insurance) {
        const data = this.insuranceData(dto.insurance);
        await tx.patientInsurance.upsert({
          where: { patientId: id },
          create: { patientId: id, ...data },
          update: data,
        });
      }
    });
    return this.findOne(id);
  }

  // ------------------------------------------------------------------ reglas

  /** RF-01: un menor de edad solo se registra con tutor legal. */
  private assertGuardian(birthDate: Date, today: Date, guardian: unknown): void {
    if (isMinor(birthDate, today) && !guardian) {
      throw new BadRequestException('El paciente es menor de edad: el tutor legal es obligatorio');
    }
  }

  private parseBirthDate(value: string, today: Date): Date {
    const birthDate = parseDateOnly(value);
    if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
    if (today.getUTCFullYear() - birthDate.getUTCFullYear() > 120) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
    return birthDate;
  }

  /** Índice ciego del documento; rechaza duplicados (el documento está cifrado en la base). */
  private async documentHashFor(documentId?: string, ignorePatientId?: string) {
    if (!documentId?.trim()) return null;
    const documentHash = this.crypto.blindIndex(documentId);
    const duplicate = await this.prisma.db.patient.findUnique({
      where: { documentHash },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== ignorePatientId) {
      throw new ConflictException('Ya existe un paciente con ese documento de identidad');
    }
    return documentHash;
  }

  private async assertInsurance(insurance: PatientInsuranceDto): Promise<void> {
    const insurer = await this.prisma.db.insurer.findUnique({ where: { id: insurance.insurerId } });
    if (!insurer || !insurer.active) {
      throw new BadRequestException('La aseguradora no existe o está desactivada');
    }
    if (insurance.validFrom && insurance.validUntil && insurance.validUntil < insurance.validFrom) {
      throw new BadRequestException('La vigencia del seguro es incoherente');
    }
  }

  private async assertNoActiveAppointments(patientId: string): Promise<void> {
    const count = await this.prisma.db.appointment.count({
      where: { patientId, status: { in: ACTIVE_APPOINTMENT_STATUSES }, endAt: { gte: new Date() } },
    });
    if (count > 0) {
      throw new ConflictException(
        'No se puede desactivar al paciente: tiene citas pendientes. Cancélelas primero.',
      );
    }
  }

  // ----------------------------------------------------------------- ayudas

  private buildSearch(query: PatientQueryDto): Prisma.PatientWhereInput {
    const text = query.q?.trim();
    const filters: Prisma.PatientWhereInput[] = [];
    if (query.active !== undefined) filters.push({ active: query.active });
    if (text) {
      const tokens = text.split(/\s+/).filter(Boolean);
      filters.push({
        OR: [
          {
            AND: tokens.map((token) => ({
              OR: [
                { firstName: { contains: token, mode: 'insensitive' as const } },
                { lastName: { contains: token, mode: 'insensitive' as const } },
              ],
            })),
          },
          { documentHash: this.crypto.blindIndex(text) },
        ],
      });
    }
    return filters.length > 0 ? { AND: filters } : {};
  }

  private scalars(dto: CreatePatientDto | UpdatePatientDto) {
    return {
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      documentId: dto.documentId?.trim() || undefined,
      sex: dto.sex,
      address: dto.address?.trim(),
      phone: dto.phone?.trim(),
      email: dto.email?.trim().toLowerCase(),
      occupation: dto.occupation?.trim(),
      preferredChannel: dto.preferredChannel,
      contactConsent: dto.contactConsent,
    };
  }

  private insuranceData(insurance: PatientInsuranceDto) {
    return {
      insurerId: insurance.insurerId,
      policyNumber: insurance.policyNumber.trim(),
      validFrom: insurance.validFrom ? parseDateOnly(insurance.validFrom) : null,
      validUntil: insurance.validUntil ? parseDateOnly(insurance.validUntil) : null,
      coveragePercent: insurance.coveragePercent ?? null,
    };
  }

  private async toView(patient: PatientWithRelations) {
    const [rules, today] = await Promise.all([this.alertRules.list(true), this.today()]);
    return toPatientView(patient, rules, today);
  }

  /** Fecha de hoy en la zona horaria de la clínica (para calcular la edad). */
  private async today(): Promise<Date> {
    const { timezone } = await this.settings.get();
    return localDateAsUtc(new Date(), timezone);
  }
}
