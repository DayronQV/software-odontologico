import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
            procedures: { create: procedures.map((p) => ({ procedureId: p.id })) },
          },
        });
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
