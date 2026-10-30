import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrescriptionStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { findAllergyConflicts, type PrescribedDrug } from '../domain/allergy-check';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import type { CreatePrescriptionDto, PrescriptionItemDto } from './dto/prescription.dto';

const PRESCRIPTION_INCLUDE = { items: true } satisfies Prisma.PrescriptionInclude;
type PrescriptionRow = Prisma.PrescriptionGetPayload<{ include: typeof PRESCRIPTION_INCLUDE }>;

export const formatPrescriptionNumber = (n: number): string => `RX-${String(n).padStart(6, '0')}`;

/** Recetas odontológicas: inmutables una vez emitidas (se corrigen anulando y emitiendo otra). */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const rows = await this.prisma.db.prescription.findMany({
      where: { patientId },
      orderBy: { issuedAt: 'desc' },
      include: PRESCRIPTION_INCLUDE,
    });
    const names = await this.lookup.userNames(rows.flatMap((r) => [r.prescriberId, r.voidedById]));
    return rows.map((row) => this.toView(row, names));
  }

  async get(id: string) {
    const row = await this.findOne(id);
    return this.toView(row, await this.lookup.userNames([row.prescriberId, row.voidedById]));
  }

  /** Cruza los fármacos con las alergias de la anamnesis, sin guardar nada (aviso en vivo). */
  async check(patientId: string, items: PrescriptionItemDto[]) {
    await this.lookup.assertPatient(patientId);
    return { conflicts: await this.conflictsFor(patientId, items) };
  }

  async create(patientId: string, dto: CreatePrescriptionDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const history = await this.prisma.db.medicalHistory.findUnique({ where: { patientId } });
    if (!history) {
      throw new ConflictException('Registre la anamnesis del paciente antes de emitir una receta');
    }

    const conflicts = await this.conflictsFor(patientId, dto.items);
    if (conflicts.length > 0 && !dto.allergyOverrideReason?.trim()) {
      throw new ConflictException({
        message: 'Alerta: el paciente es alérgico a un fármaco de la receta',
        details: { conflicts },
      });
    }

    const row = await this.prisma.db.prescription.create({
      data: {
        patientId,
        prescriberId: user.id,
        appointmentId: dto.appointmentId ?? null,
        diagnosis: dto.diagnosis?.trim() || null,
        notes: dto.notes?.trim() || null,
        allergyOverrideReason: conflicts.length > 0 ? dto.allergyOverrideReason!.trim() : null,
        items: {
          create: dto.items.map((item) => ({
            medicationId: item.medicationId ?? null,
            name: item.name.trim(),
            dose: item.dose.trim(),
            frequency: item.frequency.trim(),
            duration: item.duration.trim(),
            instructions: item.instructions?.trim() || null,
          })),
        },
      },
      include: PRESCRIPTION_INCLUDE,
    });
    return this.toView(row, new Map([[user.id, user.fullName]]));
  }

  /** Anula una receta (no se borra): queda marcada con motivo, quién y cuándo. */
  async void(id: string, reason: string, user: AuthUser) {
    const row = await this.findOne(id);
    if (row.prescriberId !== user.id) {
      throw new ForbiddenException('Solo el profesional que emitió la receta puede anularla');
    }
    if (row.status === PrescriptionStatus.VOIDED) throw new ConflictException('La receta ya fue anulada');
    const voided = await this.prisma.db.prescription.update({
      where: { id },
      data: {
        status: PrescriptionStatus.VOIDED,
        voidedAt: new Date(),
        voidedById: user.id,
        voidReason: reason.trim(),
      },
      include: PRESCRIPTION_INCLUDE,
    });
    return this.toView(voided, new Map([[user.id, user.fullName]]));
  }

  async findOne(id: string): Promise<PrescriptionRow> {
    const row = await this.prisma.db.prescription.findUnique({ where: { id }, include: PRESCRIPTION_INCLUDE });
    if (!row) throw new NotFoundException('Receta no encontrada');
    return row;
  }

  // ----------------------------------------------------------------------- interno

  private async conflictsFor(patientId: string, items: PrescriptionItemDto[]) {
    const ids = items.map((i) => i.medicationId).filter((id): id is string => !!id);
    const catalog = ids.length
      ? await this.prisma.db.medication.findMany({ where: { id: { in: ids } } })
      : [];
    if (catalog.length !== new Set(ids).size) {
      throw new BadRequestException('Algún medicamento no existe en el catálogo');
    }
    const byId = new Map(catalog.map((m) => [m.id, m]));
    const drugs: PrescribedDrug[] = items.map((item) => {
      const med = item.medicationId ? byId.get(item.medicationId) : undefined;
      return {
        name: item.name,
        activeIngredient: med?.activeIngredient,
        allergyGroups: med?.allergyGroups,
      };
    });
    const history = await this.prisma.db.medicalHistory.findUnique({
      where: { patientId },
      select: { drugAllergies: true },
    });
    return findAllergyConflicts(drugs, history?.drugAllergies ?? []);
  }

  private toView(row: PrescriptionRow, names: Map<string, string>) {
    return {
      id: row.id,
      number: row.number,
      displayNumber: formatPrescriptionNumber(row.number),
      patientId: row.patientId,
      prescriber: names.get(row.prescriberId) ?? null,
      issuedAt: row.issuedAt,
      status: row.status,
      diagnosis: row.diagnosis,
      notes: row.notes,
      allergyOverrideReason: row.allergyOverrideReason,
      void: row.voidedAt
        ? { at: row.voidedAt, by: row.voidedById ? (names.get(row.voidedById) ?? null) : null, reason: row.voidReason }
        : null,
      items: row.items.map((i) => ({
        id: i.id,
        medicationId: i.medicationId,
        name: i.name,
        dose: i.dose,
        frequency: i.frequency,
        duration: i.duration,
        instructions: i.instructions,
      })),
    };
  }
}
