import { fromLocalInputValue } from '../../../lib/format';

export interface AppointmentFormValues {
  patientId: string;
  professionalId: string;
  chairId: string;
  procedureIds: string[];
  /** Valor de <input type="datetime-local"> (hora local). */
  start: string;
  durationMinutes: number;
  notes: string;
  /** Ítems aprobados del plan de tratamiento que se agendan en la cita (RF-08). */
  treatmentItemIds?: string[];
}

export type AppointmentFormErrors = Partial<Record<keyof AppointmentFormValues, string>>;

export function validateAppointmentForm(values: AppointmentFormValues, now = new Date()): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {};
  if (!values.patientId) errors.patientId = 'Seleccione al paciente';
  if (!values.professionalId) errors.professionalId = 'Seleccione al profesional';
  if (!values.chairId) errors.chairId = 'Seleccione el sillón';
  if (values.procedureIds.length === 0) errors.procedureIds = 'Seleccione al menos un procedimiento';
  if (!values.start) errors.start = 'Indique la fecha y hora';
  else if (new Date(values.start).getTime() < now.getTime() - 5 * 60_000) errors.start = 'No se puede agendar en el pasado';
  if (!Number.isFinite(values.durationMinutes) || values.durationMinutes < 5 || values.durationMinutes > 480) {
    errors.durationMinutes = 'Entre 5 y 480 minutos';
  }
  return errors;
}

/** Cuerpo del POST /agenda/appointments (el fin se calcula con la duración). */
export function buildAppointmentPayload(values: AppointmentFormValues) {
  const startAt = fromLocalInputValue(values.start);
  const endAt = new Date(new Date(startAt).getTime() + values.durationMinutes * 60_000).toISOString();
  return {
    patientId: values.patientId,
    professionalId: values.professionalId,
    chairId: values.chairId,
    procedureIds: values.procedureIds,
    startAt,
    endAt,
    notes: values.notes.trim() || undefined,
    treatmentItemIds: values.treatmentItemIds?.length ? values.treatmentItemIds : undefined,
  };
}

/** Duración sugerida: suma de las duraciones estándar de los procedimientos elegidos. */
export function suggestedDuration(procedures: Array<{ id: string; durationMinutes: number }>, selected: string[]): number {
  const total = procedures.filter((p) => selected.includes(p.id)).reduce((sum, p) => sum + p.durationMinutes, 0);
  return total > 0 ? total : 30;
}
