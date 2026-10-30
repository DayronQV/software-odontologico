export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'WAITING_ROOM'
  | 'IN_ATTENTION'
  | 'ATTENDED'
  | 'CANCELED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  notes: string | null;
  cancelReason: string | null;
  origin: 'MANUAL' | 'TREATMENT_BUDGET';
  patient: { id: string; fullName: string; phone: string | null; hasMedicalHistory: boolean };
  professional: { id: string; fullName: string; specialty: string | null };
  chair: { id: string; name: string; officeId: string; officeName: string };
  procedures: Array<{ id: string; code: string; name: string; durationMinutes: number }>;
  /** Estados a los que el usuario actual puede llevar la cita. */
  allowedTransitions: AppointmentStatus[];
}

export interface WaitingAppointment extends Appointment {
  waitingSince: string;
}

export interface StatusLogEntry {
  id: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  note: string | null;
  createdAt: string;
  user: { fullName: string; role: string };
}

export interface NotificationEntry {
  id: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL';
  kind: 'CONFIRMATION' | 'RESCHEDULED' | 'REMINDER';
  leadHours: number | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELED';
  scheduledFor: string;
  sentAt: string | null;
  attempts: number;
  error: string | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
}
