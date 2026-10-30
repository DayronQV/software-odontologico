import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, TreatmentItemStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentsService } from '../consents/consents.service';
import { isValidToothCode } from '../domain/tooth-notation';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import type { RegisterProcedureDto } from './dto/procedure-record.dto';

const RECORD_INCLUDE = {
  procedure: { select: { code: true, name: true, category: true } },
  addenda: { orderBy: { signedAt: 'asc' } },
} satisfies Prisma.ProcedureRecordInclude;

type RecordRow = Prisma.ProcedureRecordGetPayload<{ include: typeof RECORD_INCLUDE }>;

/**
 * Procedimientos realizados (RN-01). No existe operación de modificación ni de borrado: ni en la API
 * ni en la base de datos (trigger). La corrección se hace únicamente con una adenda firmada.
 */
@Injectable()
export class ProcedureRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly consents: ConsentsService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const rows = await this.prisma.db.procedureRecord.findMany({
      where: { patientId },
      orderBy: { performedAt: 'desc' },
      include: RECORD_INCLUDE,
    });
    const names = await this.lookup.userNames(
      rows.flatMap((r) => [r.performedById, ...r.addenda.map((a) => a.authorId)]),
    );
    return rows.map((row) => this.toView(row, names));
  }

  async register(patientId: string, dto: RegisterProcedureDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const procedure = await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } });
    if (!procedure || !procedure.active) {
      throw new BadRequestException('El procedimiento no existe o está desactivado');
    }
    if (dto.toothCode !== undefined && !isValidToothCode(dto.toothCode)) {
      throw new BadRequestException(`El diente ${dto.toothCode} no existe (use un código FDI)`);
    }
    if (dto.surface && dto.toothCode === undefined) {
      throw new BadRequestException('Indique el diente de la superficie');
    }
    if (dto.appointmentId) await this.assertAppointment(dto.appointmentId, patientId);
    if (dto.treatmentItemId) await this.assertItem(dto.treatmentItemId, patientId, dto);

    await this.consents.assertSigned(patientId, dto.procedureId);

    const record = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.procedureRecord.create({
        data: {
          patientId,
          procedureId: dto.procedureId,
          appointmentId: dto.appointmentId ?? null,
          performedById: user.id,
          toothCode: dto.toothCode ?? null,
          surface: dto.surface ?? null,
          notes: dto.notes?.trim() || null,
          treatmentItemId: dto.treatmentItemId ?? null,
        },
        include: RECORD_INCLUDE,
      });
      if (dto.treatmentItemId) {
        // Pasa de aprobado/agendado a realizado en la misma transacción.
        await tx.treatmentItem.update({
          where: { id: dto.treatmentItemId },
          data: { status: TreatmentItemStatus.DONE },
        });
      }
      return created;
    });
    return this.toView(record, new Map([[user.id, user.fullName]]));
  }

  private async assertAppointment(appointmentId: string, patientId: string): Promise<void> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
      select: { patientId: true },
    });
    if (!appointment || appointment.patientId !== patientId) {
      throw new NotFoundException('La cita no existe para este paciente');
    }
  }

  private async assertItem(itemId: string, patientId: string, dto: RegisterProcedureDto): Promise<void> {
    const item = await this.prisma.db.treatmentItem.findFirst({
      where: { id: itemId, phase: { plan: { patientId } } },
      include: { appointment: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Ítem de tratamiento no encontrado');
    if (item.status !== TreatmentItemStatus.APPROVED && item.status !== TreatmentItemStatus.SCHEDULED) {
      throw new ConflictException('Solo se completan ítems aprobados por el paciente');
    }
    if (item.procedureId !== dto.procedureId) {
      throw new BadRequestException('El procedimiento no corresponde al ítem del plan');
    }
    if (item.appointment && item.appointment.status !== AppointmentStatus.IN_ATTENTION) {
      throw new ConflictException('El paciente debe estar «En atención» para completar este ítem');
    }
  }

  private toView(row: RecordRow, names: Map<string, string>) {
    return {
      id: row.id,
      patientId: row.patientId,
      procedure: row.procedure,
      toothCode: row.toothCode,
      surface: row.surface,
      notes: row.notes,
      appointmentId: row.appointmentId,
      treatmentItemId: row.treatmentItemId,
      performedAt: row.performedAt,
      performedBy: names.get(row.performedById) ?? null,
      addenda: row.addenda.map((a) => ({
        id: a.id,
        content: a.content,
        author: names.get(a.authorId) ?? null,
        signedAt: a.signedAt,
        contentHash: a.contentHash,
      })),
    };
  }
}
