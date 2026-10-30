import type { Prisma, Role } from '@prisma/client';
import { availableTransitions } from '../domain/appointment-state-machine';

/** Relaciones que se cargan siempre con una cita. */
export const APPOINTMENT_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      medicalHistory: { select: { id: true } },
    },
  },
  professional: {
    select: { id: true, specialty: true, userId: true, user: { select: { fullName: true } } },
  },
  chair: { select: { id: true, name: true, officeId: true, office: { select: { name: true } } } },
  procedures: {
    select: { procedure: { select: { id: true, code: true, name: true, durationMinutes: true } } },
  },
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

/** Vista que consume el calendario: incluye a qué estados puede pasar quien consulta. */
export function toAppointmentView(appointment: AppointmentWithRelations, role: Role) {
  return {
    id: appointment.id,
    status: appointment.status,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    notes: appointment.notes,
    cancelReason: appointment.cancelReason,
    origin: appointment.origin,
    patient: {
      id: appointment.patient.id,
      fullName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
      phone: appointment.patient.phone,
      hasMedicalHistory: appointment.patient.medicalHistory !== null,
    },
    professional: {
      id: appointment.professional.id,
      fullName: appointment.professional.user.fullName,
      specialty: appointment.professional.specialty,
    },
    chair: {
      id: appointment.chair.id,
      name: appointment.chair.name,
      officeId: appointment.chair.officeId,
      officeName: appointment.chair.office.name,
    },
    procedures: appointment.procedures.map((p) => p.procedure),
    allowedTransitions: availableTransitions(appointment.status, role),
  };
}

export type AppointmentView = ReturnType<typeof toAppointmentView>;
