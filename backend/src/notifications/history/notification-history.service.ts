import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** "***4567" / "a***@correo.com": el historial no muestra el contacto completo. */
export function maskRecipient(recipient: string | null): string | null {
  if (!recipient) return null;
  if (recipient.includes('@')) {
    const [user, domain] = recipient.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `***${recipient.slice(-4)}`;
}

@Injectable()
export class NotificationHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Historial de mensajes de una cita: confirmación, recordatorios y su estado. */
  async byAppointment(appointmentId: string) {
    const exists = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Cita no encontrada');

    const logs = await this.prisma.db.notificationLog.findMany({
      where: { appointmentId },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    });
    return logs.map((log) => ({
      id: log.id,
      channel: log.channel,
      kind: log.kind,
      leadHours: log.leadHours,
      status: log.status,
      scheduledFor: log.scheduledFor,
      sentAt: log.sentAt,
      attempts: log.attempts,
      error: log.error,
      recipient: maskRecipient(log.recipient),
      subject: log.subject,
      body: log.body,
    }));
  }
}
