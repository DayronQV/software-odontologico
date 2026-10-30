import { useCallback } from 'react';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { useResource } from '../../../lib/useResource';
import { STATUS_META } from '../appointment-status';
import type { NotificationEntry, StatusLogEntry } from '../types';

const NOTIFICATION_TONE: Record<NotificationEntry['status'], BadgeTone> = {
  PENDING: 'info',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'warning',
  CANCELED: 'neutral',
};
const NOTIFICATION_STATUS: Record<NotificationEntry['status'], string> = {
  PENDING: 'Programado',
  SENT: 'Enviado',
  FAILED: 'Falló',
  SKIPPED: 'Omitido',
  CANCELED: 'Cancelado',
};
const KIND_LABEL = (n: NotificationEntry) =>
  n.kind === 'REMINDER' ? `Recordatorio ${n.leadHours} h antes` : n.kind === 'CONFIRMATION' ? 'Confirmación' : 'Reprogramación';
const CHANNEL_LABEL = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Correo' } as const;

/** Bitácora de estados (quién y cuándo, RF-10). */
export function StatusHistory({ appointmentId }: { appointmentId: string }) {
  const loader = useCallback(() => api<StatusLogEntry[]>(`/agenda/appointments/${appointmentId}/history`), [appointmentId]);
  const { data, error, loading } = useResource(loader);
  if (loading && !data) return <Spinner />;
  if (error) return <InlineError>{error}</InlineError>;
  return (
    <ol className="space-y-3">
      {(data ?? []).map((log) => (
        <li key={log.id} className="flex gap-3">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-400" />
          <div>
            <p className="text-sm text-slate-800">
              <span className="font-medium">{STATUS_META[log.toStatus].label}</span>
              {log.fromStatus === log.toStatus ? ' (reprogramada)' : ''}
              <span className="text-slate-500"> · {log.user.fullName}</span>
            </p>
            <p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}{log.note ? ` — ${log.note}` : ''}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Historial de notificaciones de la cita (RF-11): confirmación y recordatorios 48 h / 24 h. */
export function NotificationHistory({ appointmentId }: { appointmentId: string }) {
  const loader = useCallback(() => api<NotificationEntry[]>(`/notifications/appointments/${appointmentId}`), [appointmentId]);
  const { data, error, loading } = useResource(loader);
  if (loading && !data) return <Spinner />;
  if (error) return <InlineError>{error}</InlineError>;
  if (!data || data.length === 0) return <p className="text-sm text-slate-500">Esta cita no tiene notificaciones.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {data.map((n) => (
        <li key={n.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">{KIND_LABEL(n)} <span className="font-normal text-slate-500">· {CHANNEL_LABEL[n.channel]}</span></p>
            <Badge tone={NOTIFICATION_TONE[n.status]}>{NOTIFICATION_STATUS[n.status]}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            {n.sentAt ? `Enviado ${formatDateTime(n.sentAt)}` : `Programado para ${formatDateTime(n.scheduledFor)}`}
            {n.recipient ? ` · ${n.recipient}` : ''}
            {n.error ? ` · ${n.error}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
