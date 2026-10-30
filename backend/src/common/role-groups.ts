import { Role } from '@prisma/client';

/** Grupos de roles reutilizables en los decoradores `@Roles(...)`. */
export const ALL_ROLES: Role[] = [
  Role.ADMIN_TI,
  Role.RECEPCIONISTA,
  Role.ODONTOLOGO,
  Role.ASISTENTE,
  Role.AUDITOR,
];

/** Personal con acceso a datos de pacientes (el administrador de TI y el auditor NO). */
export const PATIENT_STAFF: Role[] = [Role.RECEPCIONISTA, Role.ODONTOLOGO, Role.ASISTENTE];

/** Personal que atiende en consultorio (cambia estados clínicos de la cita). */
export const CLINICAL_STAFF: Role[] = [Role.ODONTOLOGO, Role.ASISTENTE];

/** Operación de caja y facturación. */
export const CASHIERS: Role[] = [Role.RECEPCIONISTA, Role.ADMIN_TI];
