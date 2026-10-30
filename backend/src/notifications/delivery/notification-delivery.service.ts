import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, ContactChannel, NotificationKind, NotificationStatus } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { MESSAGING_CHANNELS, type MessagingChannel } from '../../integrations/messaging/messaging-channel';
import { PrismaService } from '../../prisma/prisma.service';
import { renderMessage } from '../templates/message-templates';

/** Un recordatorio solo tiene sentido si la cita sigue vigente. */
const STALE_FOR_REMINDER: AppointmentStatus[] = [
  AppointmentStatus.CANCELED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.ATTENDED,
  AppointmentStatus.IN_ATTENTION,
];

/** Envía un mensaje registrado en NotificationLog por su canal y deja constancia del resultado. */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(MESSAGING_CHANNELS) private readonly channels: MessagingChannel[],
  ) {}

  /** `isLastAttempt`: si falla, ya no habrá más reintentos y el mensaje queda como FAILED. */
  async deliver(logId: string, isLastAttempt: boolean): Promise<void> {
    const log = await this.prisma.db.notificationLog.findUnique({
      where: { id: logId },
      include: {
        appointment: {
          include: {
            patient: true,
            professional: { include: { user: { select: { fullName: true } } } },
            chair: { include: { office: { select: { name: true } } } },
          },
        },
      },
    });
    if (!log || log.status !== NotificationStatus.PENDING) return; // cancelado o ya enviado

    const { appointment } = log;
    const { patient } = appointment;

    if (log.kind === NotificationKind.REMINDER && STALE_FOR_REMINDER.includes(appointment.status)) {
      return this.skip(logId, 'La cita ya no está vigente');
    }
    if (!patient.contactConsent) {
      return this.skip(logId, 'El paciente no autorizó el contacto');
    }
    const recipient = log.channel === ContactChannel.EMAIL ? patient.email : patient.phone;
    if (!recipient) {
      return this.skip(
        logId,
        log.channel === ContactChannel.EMAIL ? 'El paciente no tiene correo' : 'El paciente no tiene teléfono',
      );
    }
    const channel = this.channels.find((c) => c.channel === log.channel);
    if (!channel) return this.skip(logId, `Canal ${log.channel} no disponible`);

    const clinic = await this.settings.get();
    const message = renderMessage(log.kind, {
      clinicName: clinic.clinicName,
      patientFirstName: patient.firstName,
      startAt: appointment.startAt,
      timezone: clinic.timezone,
      professionalName: appointment.professional.user.fullName,
      officeName: appointment.chair.office.name,
      leadHours: log.leadHours,
    });

    try {
      const result = await channel.send({ to: recipient, ...message });
      await this.prisma.db.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
          recipient,
          subject: message.subject,
          body: message.body,
          providerMessageId: result.providerMessageId,
          error: null,
        },
      });
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.warn(`Fallo al enviar ${logId} por ${log.channel}: ${reason}`);
      await this.prisma.db.notificationLog.update({
        where: { id: logId },
        data: {
          attempts: { increment: 1 },
          error: reason.slice(0, 300),
          recipient,
          subject: message.subject,
          body: message.body,
          ...(isLastAttempt && { status: NotificationStatus.FAILED }),
        },
      });
      throw error; // BullMQ reintenta con espera exponencial
    }
  }

  private async skip(logId: string, reason: string): Promise<void> {
    await this.prisma.db.notificationLog.update({
      where: { id: logId },
      data: { status: NotificationStatus.SKIPPED, error: reason },
    });
  }
}
