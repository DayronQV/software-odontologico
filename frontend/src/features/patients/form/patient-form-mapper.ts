import type { Patient } from '../types';
import { isMinorBirthDate, type PatientFormValues } from './patient-schema';

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: '',
  lastName: '',
  documentId: '',
  birthDate: '',
  sex: 'FEMALE',
  address: '',
  phone: '',
  email: '',
  occupation: '',
  preferredChannel: 'WHATSAPP',
  contactConsent: true,
  emergencyContact: { fullName: '', relationship: '', phone: '' },
  guardian: { fullName: '', relationship: '', documentId: '', phone: '', email: '' },
  insurance: { insurerId: '', policyNumber: '', validFrom: '', validUntil: '', coveragePercent: null },
};

/** Ficha existente → valores del formulario de edición. */
export function patientToForm(patient: Patient): PatientFormValues {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    documentId: patient.documentId ?? '',
    birthDate: patient.birthDate,
    sex: patient.sex,
    address: patient.address ?? '',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    occupation: patient.occupation ?? '',
    preferredChannel: patient.preferredChannel,
    contactConsent: patient.contactConsent,
    emergencyContact: {
      fullName: patient.emergencyContact?.fullName ?? '',
      relationship: patient.emergencyContact?.relationship ?? '',
      phone: patient.emergencyContact?.phone ?? '',
    },
    guardian: {
      fullName: patient.guardian?.fullName ?? '',
      relationship: patient.guardian?.relationship ?? '',
      documentId: patient.guardian?.documentId ?? '',
      phone: patient.guardian?.phone ?? '',
      email: patient.guardian?.email ?? '',
    },
    insurance: {
      insurerId: patient.insurance?.insurerId ?? '',
      policyNumber: patient.insurance?.policyNumber ?? '',
      validFrom: patient.insurance?.validFrom ?? '',
      validUntil: patient.insurance?.validUntil ?? '',
      coveragePercent: patient.insurance?.coveragePercent ?? null,
    },
  };
}

const blankToUndefined = (value: string | undefined | null) => (value && value.trim() ? value.trim() : undefined);

/** Valores del formulario → cuerpo para la API (los campos vacíos se omiten). */
export function formToPayload(values: PatientFormValues) {
  const { guardian, insurance } = values;
  const hasGuardian = isMinorBirthDate(values.birthDate) || !!guardian.fullName;

  return {
    firstName: values.firstName,
    lastName: values.lastName,
    documentId: blankToUndefined(values.documentId),
    birthDate: values.birthDate,
    sex: values.sex,
    address: blankToUndefined(values.address),
    phone: blankToUndefined(values.phone),
    email: blankToUndefined(values.email),
    occupation: blankToUndefined(values.occupation),
    preferredChannel: values.preferredChannel,
    contactConsent: values.contactConsent,
    emergencyContact: values.emergencyContact,
    guardian: hasGuardian
      ? {
          fullName: guardian.fullName,
          relationship: guardian.relationship,
          phone: guardian.phone,
          documentId: blankToUndefined(guardian.documentId),
          email: blankToUndefined(guardian.email),
        }
      : undefined,
    insurance: insurance.insurerId
      ? {
          insurerId: insurance.insurerId,
          policyNumber: insurance.policyNumber,
          validFrom: blankToUndefined(insurance.validFrom),
          validUntil: blankToUndefined(insurance.validUntil),
          coveragePercent: typeof insurance.coveragePercent === 'number' && !Number.isNaN(insurance.coveragePercent) ? insurance.coveragePercent : undefined,
        }
      : undefined,
  };
}
