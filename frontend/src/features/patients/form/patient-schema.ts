import { z } from 'zod';

/** Mayoría de edad: bajo esta edad el tutor legal es obligatorio (RF-01). */
export const ADULT_AGE = 18;

/** Edad cumplida a `today` para una fecha "AAAA-MM-DD" (sin desfase por zona horaria). */
export function ageFromBirthDate(birthDate: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export const isMinorBirthDate = (birthDate: string, today = new Date()): boolean => {
  const age = ageFromBirthDate(birthDate, today);
  return age !== null && age >= 0 && age < ADULT_AGE;
};

const PHONE = /^[0-9+\-\s()]{7,20}$/;
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalPhone = z.string().trim().regex(PHONE, 'Teléfono inválido').optional().or(z.literal(''));
const optionalEmail = z.string().trim().email('Correo inválido').optional().or(z.literal(''));
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().or(z.literal(''));

export const patientFormSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
    lastName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
    documentId: z.string().trim().min(4, 'Mínimo 4 caracteres').max(30).optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingrese la fecha de nacimiento')
      .refine((v) => (ageFromBirthDate(v) ?? -1) >= 0, 'La fecha no puede ser futura')
      .refine((v) => (ageFromBirthDate(v) ?? 0) <= 120, 'Fecha de nacimiento inválida'),
    sex: z.enum(['FEMALE', 'MALE', 'OTHER']),
    address: optionalText(200),
    phone: optionalPhone,
    email: optionalEmail,
    occupation: optionalText(80),
    preferredChannel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']),
    contactConsent: z.boolean(),
    emergencyContact: z.object({
      fullName: z.string().trim().min(2, 'Ingrese el nombre').max(100),
      relationship: z.string().trim().min(2, 'Ingrese el parentesco').max(40),
      phone: z.string().trim().regex(PHONE, 'Teléfono inválido'),
    }),
    guardian: z.object({
      fullName: optionalText(100),
      relationship: optionalText(40),
      documentId: optionalText(30),
      phone: optionalPhone,
      email: optionalEmail,
    }),
    insurance: z.object({
      insurerId: z.string().optional().or(z.literal('')),
      policyNumber: optionalText(40),
      validFrom: optionalDate,
      validUntil: optionalDate,
      coveragePercent: z.number().min(0).max(100).nullable().optional(),
    }),
  })
  .superRefine((v, ctx) => {
    // RF-01: tutor legal obligatorio para menores de edad
    if (isMinorBirthDate(v.birthDate)) {
      const missing: Array<[keyof typeof v.guardian, string]> = [
        ['fullName', 'El tutor legal es obligatorio'],
        ['relationship', 'Ingrese el parentesco'],
        ['phone', 'Ingrese el teléfono del tutor'],
      ];
      for (const [field, message] of missing) {
        if (!v.guardian[field]) ctx.addIssue({ code: 'custom', path: ['guardian', field], message });
      }
    }
    if (v.insurance.insurerId && !v.insurance.policyNumber) {
      ctx.addIssue({ code: 'custom', path: ['insurance', 'policyNumber'], message: 'Ingrese el número de póliza' });
    }
    if (v.insurance.validFrom && v.insurance.validUntil && v.insurance.validUntil < v.insurance.validFrom) {
      ctx.addIssue({ code: 'custom', path: ['insurance', 'validUntil'], message: 'La vigencia es incoherente' });
    }
    if (v.contactConsent && v.preferredChannel === 'EMAIL' && !v.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'El canal elegido es el correo: ingréselo' });
    }
    if (v.contactConsent && v.preferredChannel !== 'EMAIL' && !v.phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'El canal elegido necesita un teléfono' });
    }
  });

export type PatientFormValues = z.infer<typeof patientFormSchema>;
