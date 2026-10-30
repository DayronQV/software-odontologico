import type { BadgeTone } from '../../components/ui/Badge';
import type { AppointmentStatus } from './types';

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** Colores suaves del evento en el calendario. */
  event: { background: string; border: string; text: string };
  /** Texto del botón que lleva la cita a este estado. */
  action: string;
}

/** RF-10: los 7 estados de la cita, con colores pastel para el calendario. */
export const STATUS_META: Record<AppointmentStatus, StatusMeta> = {
  SCHEDULED: { label: 'Programado', tone: 'info', action: 'Programar', event: { background: '#e8f1f8', border: '#6fa3c7', text: '#1f4a6b' } },
  CONFIRMED: { label: 'Confirmado', tone: 'brand', action: 'Confirmar cita', event: { background: '#e1f3f1', border: '#3fa39d', text: '#1b5a56' } },
  WAITING_ROOM: { label: 'En sala de espera', tone: 'warning', action: 'Llegó: enviar a sala de espera', event: { background: '#fdf1d6', border: '#e0a93a', text: '#7a5410' } },
  IN_ATTENTION: { label: 'En atención', tone: 'violet', action: 'Iniciar atención', event: { background: '#ece6fa', border: '#8c78d6', text: '#483a8a' } },
  ATTENDED: { label: 'Atendido', tone: 'success', action: 'Finalizar atención', event: { background: '#e2f4e8', border: '#55b27a', text: '#1f5c38' } },
  CANCELED: { label: 'Cancelado', tone: 'danger', action: 'Cancelar cita', event: { background: '#f8e4e6', border: '#d9798a', text: '#8a2f40' } },
  NO_SHOW: { label: 'No asistió', tone: 'neutral', action: 'Marcar "No asistió"', event: { background: '#eceae6', border: '#a39f95', text: '#5c584f' } },
};

export const STATUS_ORDER: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'WAITING_ROOM',
  'IN_ATTENTION',
  'ATTENDED',
  'CANCELED',
  'NO_SHOW',
];

/** Las citas canceladas o con inasistencia ya no ocupan horario: se atenúan en el calendario. */
export const isReleased = (status: AppointmentStatus): boolean => status === 'CANCELED' || status === 'NO_SHOW';

export function formatWaiting(since: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return 'recién llegó';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
