import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Role, TreatmentItemStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types';
import { RemindersService } from '../../notifications/reminders/reminders.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  canRoleSetStatus,
  canTransition,
  CLOSING_STATUSES,
} from '../domain/appointment-state-machine';
import { AppointmentEventsPublisher } from './appointment-events.publisher';
import { AppointmentsQueryService } from './appointments-query.service';
import type { ChangeStatusDto } from './dto/appointment.dto';

/** Control de estados de la cita (RF-10): transiciones válidas, permisos por rol y bitácora. */
@Injectable()
export class AppointmentStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: AppointmentsQueryService,
    private readonly reminders: RemindersService,
    private readonly events: AppointmentEventsPublisher,
  ) {}

  /** `note` permite dejar constancia del origen del cambio (p. ej. respuesta del paciente). */
  async change(id: string, dto: ChangeStatusDto, user: AuthUser, note?: string) {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: {
        professional: { select: { userId: true } },
        patient: { select: { medicalHistory: { select: { id: true } } } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const from = appointment.status;
    const { to } = dto;
    if (!canTransition(from, to)) {
      throw new ConflictException(`No se puede pasar una cita de "${from}" a "${to}"`);
    }
    if (!canRoleSetStatus(user.role, to)) {
      throw new ForbiddenException('Su perfil no puede realizar este cambio de estado');
    }
    // Un odontólogo solo atiende sus propias citas
    if (user.role === Role.ODONTOLOGO && appointment.professional.userId !== user.id) {
      throw new ForbiddenException('Solo puede atender las citas de su propia agenda');
    }
    if (to === AppointmentStatus.CANCELED && !dto.reason?.trim()) {
      throw new BadRequestException('Indique el motivo de la cancelación');
    }
    // RF-02: no se abre la atención sin anamnesis registrada
    if (to === AppointmentStatus.IN_ATTENTION && !appointment.patient.medicalHistory) {
      throw new ConflictException(
        'No se puede iniciar la atención: el paciente no tiene anamnesis registrada',
      );
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id },
        data: {
          status: to,
          ...(to === AppointmentStatus.CANCELED && { cancelReason: dto.reason?.trim() }),
        },
      });
      await tx.appointmentStatusLog.create({
        data: {
          appointmentId: id,
          fromStatus: from,
          toStatus: to,
          userId: user.id,
          note: note ?? dto.reason?.trim() ?? null,
        },
      });
      if (to === AppointmentStatus.CANCELED || to === AppointmentStatus.NO_SHOW) {
        // Los ítems del plan vuelven a estar disponibles para agendarse de nuevo (RF-08)
        await tx.treatmentItem.updateMany({
          where: { appointmentId: id, status: TreatmentItemStatus.SCHEDULED },
          data: { status: TreatmentItemStatus.APPROVED, appointmentId: null },
        });
      }
    });

    if (CLOSING_STATUSES.includes(to)) await this.reminders.onAppointmentClosed(id);
    const view = await this.query.findOne(id, user);
    this.events.publish('status', view);
    return view;
  }
}
