import { NotificationKind } from '@prisma/client';
import { formatLocalDateTime } from '../../common/local-time';

export interface MessageContext {
  clinicName: string;
  patientFirstName: string;
  startAt: Date;
  timezone: string;
  professionalName: string;
  officeName: string;
  /** Antelación del recordatorio, en horas. */
  leadHours?: number | null;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

function describeLead(hours: number): string {
  if (hours === 24) return 'mañana';
  if (hours === 48) return 'pasado mañana';
  return `en ${hours} horas`;
}

/** Textos de confirmación y recordatorio de la cita (RF-11). */
export function renderMessage(kind: NotificationKind, ctx: MessageContext): RenderedMessage {
  const when = formatLocalDateTime(ctx.startAt, ctx.timezone);
  const details = `Profesional: ${ctx.professionalName}\nConsultorio: ${ctx.officeName}`;

  switch (kind) {
    case NotificationKind.CONFIRMATION:
      return {
        subject: `Cita agendada — ${ctx.clinicName}`,
        body:
          `Hola ${ctx.patientFirstName}, su cita en ${ctx.clinicName} quedó agendada para el ${when}.\n` +
          `${details}\nResponda SÍ para confirmar su asistencia.`,
      };
    case NotificationKind.RESCHEDULED:
      return {
        subject: `Cita reprogramada — ${ctx.clinicName}`,
        body:
          `Hola ${ctx.patientFirstName}, su cita en ${ctx.clinicName} fue reprogramada para el ${when}.\n` +
          `${details}\nResponda SÍ para confirmar su asistencia.`,
      };
    case NotificationKind.REMINDER:
      return {
        subject: `Recordatorio de cita — ${ctx.clinicName}`,
        body:
          `Hola ${ctx.patientFirstName}, le recordamos su cita ${describeLead(ctx.leadHours ?? 24)} en ${ctx.clinicName}: ${when}.\n` +
          `${details}\nSi no puede asistir, avísenos con anticipación.`,
      };
  }
}
