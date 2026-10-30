import { AppointmentStatus as Status, Role } from '@prisma/client';

/**
 * RF-10 — transiciones válidas del turno:
 * Programado → Confirmado → En Sala de Espera → En Atención → Atendido,
 * y desde los estados previos a la atención: Cancelado o No Asistió.
 */
export const TRANSITIONS: Record<Status, Status[]> = {
  [Status.SCHEDULED]: [Status.CONFIRMED, Status.WAITING_ROOM, Status.CANCELED, Status.NO_SHOW],
  [Status.CONFIRMED]: [Status.WAITING_ROOM, Status.CANCELED, Status.NO_SHOW],
  [Status.WAITING_ROOM]: [Status.IN_ATTENTION, Status.CANCELED, Status.NO_SHOW],
  [Status.IN_ATTENTION]: [Status.ATTENDED],
  [Status.ATTENDED]: [],
  [Status.CANCELED]: [],
  [Status.NO_SHOW]: [],
};

/** Quién puede llevar la cita a cada estado: recepción gestiona el flujo; la atención es clínica. */
const ROLES_BY_TARGET: Record<Status, Role[]> = {
  [Status.SCHEDULED]: [],
  [Status.CONFIRMED]: [Role.RECEPCIONISTA],
  [Status.WAITING_ROOM]: [Role.RECEPCIONISTA],
  [Status.IN_ATTENTION]: [Role.ODONTOLOGO, Role.ASISTENTE],
  [Status.ATTENDED]: [Role.ODONTOLOGO, Role.ASISTENTE],
  [Status.CANCELED]: [Role.RECEPCIONISTA],
  [Status.NO_SHOW]: [Role.RECEPCIONISTA],
};

/** Estados que ya no ocupan el sillón ni el profesional. */
export const RELEASED_STATUSES: Status[] = [Status.CANCELED, Status.NO_SHOW];

/** Estados en los que todavía se puede reprogramar. */
export const RESCHEDULABLE_STATUSES: Status[] = [Status.SCHEDULED, Status.CONFIRMED];

/** Estados terminales: cierran los recordatorios pendientes. */
export const CLOSING_STATUSES: Status[] = [Status.ATTENDED, Status.CANCELED, Status.NO_SHOW];

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canRoleSetStatus(role: Role, to: Status): boolean {
  return ROLES_BY_TARGET[to].includes(role);
}

/** Estados a los que `role` puede llevar una cita que hoy está en `from`. */
export function availableTransitions(from: Status, role: Role): Status[] {
  return TRANSITIONS[from].filter((to) => canRoleSetStatus(role, to));
}
