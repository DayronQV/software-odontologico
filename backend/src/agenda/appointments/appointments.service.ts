import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentOrigin, TreatmentItemStatus } from '@prisma/client';
import { isExclusionViolation } from '../../common/prisma-errors';
import type { AuthUser } from '../../common/types';
import { RemindersService } from '../../notifications/reminders/reminders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RESCHEDULABLE_STATUSES } from '../domain/appointment-state-machine';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { AppointmentsQueryService } from './appointments-query.service';
import { AvailabilityService } from './availability.service';
import type { CreateAppointmentDto, RescheduleAppointmentDto } from './dto/appointment.dto';

const OCCUPIED_MESSAGE = 'El horario acaba de ser ocupado por otra cita. Elija otro horario.';

/** Alta y reprogramación de citas (RF-09, RN-03). Los cambios de estado viven en AppointmentStatusService. */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly query: AppointmentsQueryService,
    private readonly reminders: RemindersService,
    private readonly events: AppointmentEventsPublisher,
  ) {}

  async create(dto: CreateAppointmentDto, user: AuthUser) {
    const procedures = await this.loadProcedures(dto.procedureIds);
    const treatmentItemIds = dto.treatmentItemIds ?? [];
    await this.assertSchedulableItems(treatmentItemIds, dto.patientId, dto.procedureIds);
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt
      ? new Date(dto.endAt)
      : new Date(startAt.getTime() + procedures.reduce((sum, p) => sum + p.durationMinutes, 0) * 60_000);

    await this.availability.assertAvailable({
      patientId: dto.patientId,
      professionalId: dto.professionalId,
      chairId: dto.chairId,
      startAt,
      endAt,
    });

    let appointmentId: string;
    try {
      appointmentId = await this.prisma.db.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({
          data: {
            patientId: dto.patientId,
            professionalId: dto.professionalId,
            chairId: dto.chairId,
            startAt,
            endAt,
            notes: dto.notes?.trim(),
            createdById: user.id,
            origin: treatmentItemIds.length > 0 ? AppointmentOrigin.TREATMENT_BUDGET : AppointmentOrigin.MANUAL,
            procedures: { create: procedures.map((p) => ({ procedureId: p.id })) },
          },
        });
        if (treatmentItemIds.length > 0) {
          // RF-08: el ítem aprobado queda vinculado a la cita
          await tx.treatmentItem.updateMany({
            where: { id: { in: treatmentItemIds }, status: TreatmentItemStatus.APPROVED },
            data: { status: TreatmentItemStatus.SCHEDULED, appointmentId: appointment.id },
          });
        }
        await tx.appointmentStatusLog.create({
          data: {
            appointmentId: appointment.id,
            toStatus: appointment.status,
            userId: user.id,
            note: 'Cita agendada',
          },
        });
        return appointment.id;
      });
    } catch (error) {
      // RN-03: si dos peticiones simultáneas pasan la validación, PostgreSQL rechaza la segunda.
      if (isExclusionViolation(error)) throw new ConflictException(OCCUPIED_MESSAGE);
      throw error;
    }

    const view = await this.query.findOne(appointmentId, user);
    await this.reminders.onAppointmentCreated(appointmentId);
    this.events.publish('created', view);
    return view;
  }

  async reschedule(id: string, dto: RescheduleAppointmentDto, user: AuthUser) {
    const existing = await this.prisma.db.appointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cita no encontrada');
    if (!RESCHEDULABLE_STATUSES.includes(existing.status)) {
      throw new ConflictException('Solo se pueden reprogramar citas programadas o confirmadas');
    }

    const startAt = new Date(dto.startAt);
    const duration = existing.endAt.getTime() - existing.startAt.getTime();
    const endAt = dto.endAt ? new Date(dto.endAt) : new Date(startAt.getTime() + duration);
    const chairId = dto.chairId ?? existing.chairId;
    const professionalId = dto.professionalId ?? existing.professionalId;

    await this.availability.assertAvailable({
      patientId: existing.patientId,
      professionalId,
      chairId,
      startAt,
      endAt,
      ignoreAppointmentId: id,
    });

    try {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id },
          data: { startAt, endAt, chairId, professionalId },
        });
        await tx.appointmentStatusLog.create({
          data: {
            appointmentId: id,
            fromStatus: existing.status,
            toStatus: existing.status,
            userId: user.id,
            note: 'Cita reprogramada',
          },
        });
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new ConflictException(OCCUPIED_MESSAGE);
      throw error;
    }

    const view = await this.query.findOne(id, user);
    await this.reminders.onAppointmentRescheduled(id);
    this.events.publish('updated', view);
    return view;
  }

  /** Solo se agendan ítems que el paciente ya aprobó, del mismo paciente y con su procedimiento incluido. */
  private async assertSchedulableItems(itemIds: string[], patientId: string, procedureIds: string[]) {
    if (itemIds.length === 0) return;
    const items = await this.prisma.db.treatmentItem.findMany({
      where: { id: { in: itemIds }, phase: { plan: { patientId } } },
      select: { status: true, procedureId: true },
    });
    if (items.length !== itemIds.length) {
      throw new BadRequestException('Algún ítem del plan no existe o no pertenece al paciente');
    }
    if (items.some((item) => item.status !== TreatmentItemStatus.APPROVED)) {
      throw new ConflictException('Solo se pueden agendar ítems aprobados por el paciente y sin cita');
    }
    if (items.some((item) => !procedureIds.includes(item.procedureId))) {
      throw new BadRequestException('Los procedimientos de la cita deben incluir los de los ítems elegidos');
    }
  }

  private async loadProcedures(ids: string[]) {
    const procedures = await this.prisma.db.procedure.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, durationMinutes: true },
    });
    if (procedures.length !== ids.length) {
      throw new BadRequestException('Algún procedimiento no existe o está desactivado');
    }
    return procedures;
  }
}
