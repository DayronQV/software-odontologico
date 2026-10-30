export interface Chair {
  id: string;
  officeId: string;
  name: string;
  active: boolean;
}

export interface Office {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  chairs: Chair[];
}

export interface ScheduleSlot {
  weekday: number; // 0 = domingo … 6 = sábado
  startMinute: number;
  endMinute: number;
}

export type ProfessionalKind = 'GENERAL' | 'SPECIALIST';

export interface Professional {
  id: string;
  userId: string;
  kind: ProfessionalKind;
  specialty: string | null;
  licenseNumber: string | null;
  active: boolean;
  user: { id: string; fullName: string; email: string };
  schedules: ScheduleSlot[];
}

export interface Procedure {
  id: string;
  code: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePrice: number;
  labCost: number;
  requiresConsent: boolean;
  active: boolean;
}

export interface Insurer {
  id: string;
  name: string;
  active: boolean;
}

export interface ClinicSettings {
  clinicName: string;
  timezone: string;
  currency: string;
  taxRatePercent: number;
  opensAtMinute: number;
  closesAtMinute: number;
  reminderHours: number[];
  maxDiscountPercent: number;
  /** Horas durante las que una nota de evolución sigue siendo editable. */
  noteLockHours: number;
}

export type AlertKind = 'DRUG_ALLERGY' | 'SYSTEMIC_DISEASE' | 'COAGULOPATHY' | 'ANTICOAGULANT';
export type AlertSeverity = 'CRITICAL' | 'WARNING';

export interface AlertRule {
  id: string;
  label: string;
  kind: AlertKind;
  keyword: string | null;
  severity: AlertSeverity;
  active: boolean;
}
