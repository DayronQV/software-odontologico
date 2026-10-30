import { describe, expect, it } from 'vitest';
import { EMPTY_PATIENT_FORM, formToPayload, patientToForm } from './patient-form-mapper';
import { ageFromBirthDate, isMinorBirthDate, patientFormSchema, type PatientFormValues } from './patient-schema';
import type { Patient } from '../types';

const TODAY = new Date(2026, 10, 2); // 2 de noviembre de 2026
const adult: PatientFormValues = {
  ...EMPTY_PATIENT_FORM,
  firstName: 'Carlos',
  lastName: 'Mendoza',
  birthDate: '1990-05-20',
  phone: '+593 99 123 4567',
  emergencyContact: { fullName: 'Rosa Mendoza', relationship: 'Esposa', phone: '+593 98 765 4321' },
};
const guardian = { fullName: 'Laura Madre', relationship: 'Madre', documentId: '', phone: '+593 97 000 1111', email: '' };

const errorsOf = (values: PatientFormValues) => {
  const result = patientFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('edad y mayoría de edad (RF-01)', () => {
  it('calcula la edad cumplida', () => {
    expect(ageFromBirthDate('2000-11-02', TODAY)).toBe(26);
    expect(ageFromBirthDate('2000-11-03', TODAY)).toBe(25);
    expect(ageFromBirthDate('no-fecha', TODAY)).toBeNull();
  });

  it('es menor hasta el día anterior a cumplir 18', () => {
    expect(isMinorBirthDate('2008-11-03', TODAY)).toBe(true);
    expect(isMinorBirthDate('2008-11-02', TODAY)).toBe(false);
    expect(isMinorBirthDate('', TODAY)).toBe(false);
  });
});

describe('validación de la ficha del paciente', () => {
  it('acepta un adulto con contacto de emergencia', () => {
    expect(errorsOf(adult)).toEqual([]);
  });

  it('un menor de edad exige tutor legal completo', () => {
    const year = new Date().getFullYear() - 8;
    const minor = { ...adult, birthDate: `${year}-03-10` };
    expect(errorsOf(minor)).toEqual(expect.arrayContaining(['guardian.fullName', 'guardian.relationship', 'guardian.phone']));
    expect(errorsOf({ ...minor, guardian })).toEqual([]);
  });

  it('exige el contacto de emergencia completo', () => {
    const errors = errorsOf({ ...adult, emergencyContact: { fullName: '', relationship: '', phone: '' } });
    expect(errors).toEqual(expect.arrayContaining(['emergencyContact.fullName', 'emergencyContact.relationship', 'emergencyContact.phone']));
  });

  it('rechaza fechas futuras, absurdas o mal formadas y teléfonos inválidos', () => {
    expect(errorsOf({ ...adult, birthDate: '2999-01-01' })).toContain('birthDate');
    expect(errorsOf({ ...adult, birthDate: '1800-01-01' })).toContain('birthDate');
    expect(errorsOf({ ...adult, birthDate: '' })).toContain('birthDate');
    expect(errorsOf({ ...adult, phone: 'abc' })).toContain('phone');
    expect(errorsOf({ ...adult, email: 'sin-arroba' })).toContain('email');
  });

  it('el canal elegido necesita su dato de contacto cuando el paciente autoriza mensajes', () => {
    expect(errorsOf({ ...adult, preferredChannel: 'EMAIL', email: '' })).toContain('email');
    expect(errorsOf({ ...adult, preferredChannel: 'WHATSAPP', phone: '' })).toContain('phone');
    expect(errorsOf({ ...adult, preferredChannel: 'EMAIL', email: 'a@b.co', phone: '' })).toEqual([]);
    expect(errorsOf({ ...adult, contactConsent: false, phone: '' })).toEqual([]);
  });

  it('el seguro requiere póliza y vigencia coherente', () => {
    const insurance = { ...adult.insurance, insurerId: 'abc' };
    expect(errorsOf({ ...adult, insurance })).toContain('insurance.policyNumber');
    expect(errorsOf({ ...adult, insurance: { ...insurance, policyNumber: 'P1', validFrom: '2026-12-01', validUntil: '2026-01-01' } })).toContain('insurance.validUntil');
    expect(errorsOf({ ...adult, insurance: { ...insurance, policyNumber: 'P1' } })).toEqual([]);
  });
});

describe('conversión formulario ↔ API', () => {
  it('omite los campos vacíos y no envía tutor ni seguro si no corresponden', () => {
    const payload = formToPayload(adult);
    expect(payload).toMatchObject({ firstName: 'Carlos', documentId: undefined, address: undefined, guardian: undefined, insurance: undefined });
    expect(payload.emergencyContact.fullName).toBe('Rosa Mendoza');
  });

  it('envía el tutor para un menor y el seguro cuando hay aseguradora', () => {
    const year = new Date().getFullYear() - 8;
    const payload = formToPayload({
      ...adult,
      birthDate: `${year}-03-10`,
      guardian,
      insurance: { insurerId: 'ins-1', policyNumber: 'P-9', validFrom: '', validUntil: '2027-01-01', coveragePercent: 80 },
    });
    expect(payload.guardian).toMatchObject({ fullName: 'Laura Madre', phone: '+593 97 000 1111', documentId: undefined });
    expect(payload.insurance).toMatchObject({ insurerId: 'ins-1', validFrom: undefined, validUntil: '2027-01-01', coveragePercent: 80 });
  });

  it('convierte una ficha existente en valores del formulario (y de vuelta sin pérdidas)', () => {
    const patient = {
      id: '1', firstName: 'Ana', lastName: 'Torres', fullName: 'Ana Torres', documentId: '0934567890', birthDate: '1996-02-14', age: 30, isMinor: false,
      sex: 'FEMALE', address: null, phone: '+593 96 222 3344', email: 'ana@correo.test', occupation: null, preferredChannel: 'SMS', contactConsent: true,
      active: true, createdAt: '', guardian: null, emergencyContact: { fullName: 'Luis', relationship: 'Hermano', phone: '+593 96 222 9988' },
      insurance: null, hasMedicalHistory: false, alerts: [],
    } as Patient;
    const form = patientToForm(patient);
    expect(form).toMatchObject({ firstName: 'Ana', address: '', preferredChannel: 'SMS', documentId: '0934567890' });
    expect(errorsOf(form)).toEqual([]);
    expect(formToPayload(form)).toMatchObject({ documentId: '0934567890', phone: '+593 96 222 3344', guardian: undefined });
  });
});
