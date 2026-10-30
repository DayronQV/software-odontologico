import type { Prisma } from '@prisma/client';
import { AlertSeverity } from '@prisma/client';
import { evaluateAlerts, type AlertRuleLike, type MedicalAlert } from './alerts/alert-evaluator';
import { calculateAge, formatDateOnly, isMinor } from './domain/age';

/** Relaciones que se cargan siempre con un paciente. */
export const PATIENT_INCLUDE = {
  guardian: true,
  emergencyContact: true,
  insurance: { include: { insurer: { select: { id: true, name: true } } } },
  medicalHistory: true,
} satisfies Prisma.PatientInclude;

export type PatientWithRelations = Prisma.PatientGetPayload<{ include: typeof PATIENT_INCLUDE }>;

const optionalDate = (date: Date | null) => (date ? formatDateOnly(date) : null);

/** Ficha completa del paciente: la cabecera del expediente usa `alerts` para el badge (RF-02). */
export function toPatientView(patient: PatientWithRelations, rules: AlertRuleLike[], today: Date) {
  const { guardian, emergencyContact, insurance, medicalHistory } = patient;
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    fullName: `${patient.firstName} ${patient.lastName}`,
    documentId: patient.documentId,
    birthDate: formatDateOnly(patient.birthDate),
    age: calculateAge(patient.birthDate, today),
    isMinor: isMinor(patient.birthDate, today),
    sex: patient.sex,
    address: patient.address,
    phone: patient.phone,
    email: patient.email,
    occupation: patient.occupation,
    preferredChannel: patient.preferredChannel,
    contactConsent: patient.contactConsent,
    active: patient.active,
    createdAt: patient.createdAt,
    guardian: guardian && {
      fullName: guardian.fullName,
      relationship: guardian.relationship,
      documentId: guardian.documentId,
      phone: guardian.phone,
      email: guardian.email,
    },
    emergencyContact: emergencyContact && {
      fullName: emergencyContact.fullName,
      relationship: emergencyContact.relationship,
      phone: emergencyContact.phone,
    },
    insurance: insurance && {
      insurerId: insurance.insurerId,
      insurerName: insurance.insurer.name,
      policyNumber: insurance.policyNumber,
      validFrom: optionalDate(insurance.validFrom),
      validUntil: optionalDate(insurance.validUntil),
      coveragePercent: insurance.coveragePercent,
    },
    hasMedicalHistory: medicalHistory !== null,
    alerts: evaluateAlerts(medicalHistory, rules),
  };
}

export type PatientView = ReturnType<typeof toPatientView>;

/** "****345": el listado no muestra el documento completo. */
export function maskDocument(documentId: string | null): string | null {
  if (!documentId) return null;
  return `${'*'.repeat(Math.max(documentId.length - 3, 0))}${documentId.slice(-3)}`;
}

/** Fila del listado: solo lo necesario, con las alertas críticas para verlas de un vistazo. */
export function toPatientListItem(
  patient: PatientWithRelations,
  rules: AlertRuleLike[],
  today: Date,
) {
  const alerts: MedicalAlert[] = evaluateAlerts(patient.medicalHistory, rules).filter(
    (a) => a.severity === AlertSeverity.CRITICAL,
  );
  return {
    id: patient.id,
    fullName: `${patient.firstName} ${patient.lastName}`,
    documentMasked: maskDocument(patient.documentId),
    birthDate: formatDateOnly(patient.birthDate),
    age: calculateAge(patient.birthDate, today),
    isMinor: isMinor(patient.birthDate, today),
    phone: patient.phone,
    active: patient.active,
    hasMedicalHistory: patient.medicalHistory !== null,
    criticalAlerts: alerts,
  };
}
