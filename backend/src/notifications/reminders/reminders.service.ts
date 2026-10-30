import { Injectable, Logger } from '@nestjs/common';
import { NotificationKind } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationOutboxService } from '../outbox/notification-outbox.service';
import { planReminders } from './reminder-planner';

/**
 * Coordina los mensajes de una cita (RF-11): confirmación inmediata y recordatorios a las horas
 * configuradas (48 h y 24 h por defecto). Si algo falla aquí no se revierte la cita, que ya fue
 * guardada: se registra el error.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  /** Cita nueva: confirmación inmediata + recordatorios. */
  onAppointmentCreated(appointmentId: string): Promise<void> {
    return this.safely(appointmentId, () => this.schedule(appointmentId, NotificationKind.CONFIRMATION));
  }

  /** Cita reprogramada: se cancelan los mensajes pendientes y se programan los nuevos. */
  onAppointmentRescheduled(appointmentId: string): Promise<void> {
    return this.safely(appointmentId, async () => {
      await this.outbox.cancelPending(appointmentId);
      await this.schedule(appointmentId, NotificationKind.RESCHEDULED);
    });
  }

  /** Cita cancelada, sin asistencia o atendida: ya no hay nada que recordar. */
  onAppointmentClosed(appointmentId: string): Promise<void> {
    return this.safely(appointmentId, async () => {
      await this.outbox.cancelPending(appointmentId);
    });
  }

  private async schedule(appointmentId: string, firstKind: NotificationKind): Promise<void> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
      select: { startAt: true, patient: { select: { preferredChannel: true } } },
    });
    if (!appointment) return;

    const channel = appointment.patient.preferredChannel;
    await this.outbox.enqueue({ appointmentId, channel, kind: firstKind, runAt: new Date() });

    const { reminderHours } = await this.settings.get();
    for (const reminder of planReminders(appointment.startAt, new Date(), reminderHours)) {
      await this.outbox.enqueue({
        appointmentId,
        channel,
        kind: NotificationKind.REMINDER,
        leadHours: reminder.leadHours,
        runAt: reminder.runAt,
      });
    }
  }

  private async safely(appointmentId: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.error(
        `No se pudieron programar las notificaciones de la cita ${appointmentId}: ${(error as Error).message}`,
      );
    }
  }
}
