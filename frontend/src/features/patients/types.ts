export type Sex = 'FEMALE' | 'MALE' | 'OTHER';
export type ContactChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';

export const SEX_LABELS: Record<Sex, string> = { FEMALE: 'Femenino', MALE: 'Masculino', OTHER: 'Otro' };
export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Correo electrónico',
};

export interface MedicalAlert {
  ruleId: string;
  label: string;
  kind: string;
  severity: 'CRITICAL' | 'WARNING';
  detail?: string;
}

export interface PatientListItem {
  id: string;
  fullName: string;
  documentMasked: string | null;
  birthDate: string;
  age: number;
  isMinor: boolean;
  phone: string | null;
  active: boolean;
  hasMedicalHistory: boolean;
  criticalAlerts: MedicalAlert[];
}

export interface Guardian {
  fullName: string;
  relationship: string;
  documentId: string | null;
  phone: string;
  email: string | null;
}

export interface EmergencyContact {
  fullName: string;
  relationship: string;
  phone: string;
}

export interface PatientInsurance {
  insurerId: string;
  insurerName: string;
  policyNumber: string;
  validFrom: string | null;
  validUntil: string | null;
  coveragePercent: number | null;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  documentId: string | null;
  birthDate: string;
  age: number;
  isMinor: boolean;
  sex: Sex;
  address: string | null;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  preferredChannel: ContactChannel;
  contactConsent: boolean;
  active: boolean;
  createdAt: string;
  guardian: Guardian | null;
  emergencyContact: EmergencyContact | null;
  insurance: PatientInsurance | null;
  hasMedicalHistory: boolean;
  alerts: MedicalAlert[];
}

export interface MedicalHistory {
  systemicDiseases: string[];
  drugAllergies: string[];
  coagulopathies: string[];
  surgicalHistory: string | null;
  currentMedication: string | null;
  anticoagulated: boolean;
}

export interface MedicalHistoryResponse {
  history: MedicalHistory | null;
  alerts: MedicalAlert[];
}
