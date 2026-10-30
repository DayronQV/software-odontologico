import { z } from 'zod';
import { ALL_ROLES } from './roles';

/** Misma política que el backend: 12+ caracteres con mayúscula, minúscula, número y símbolo. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;
export const PASSWORD_MESSAGE =
  'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo';

export const loginSchema = z.object({
  email: z.string().min(1, 'Ingrese su correo').email('Correo inválido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});

export const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
});

export const recoverySchema = z.object({
  recoveryCode: z
    .string()
    .regex(/^[A-Fa-f0-9]{10}-[A-Fa-f0-9]{10}$/, 'Formato: XXXXXXXXXX-XXXXXXXXXX'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingrese su contraseña actual'),
    newPassword: z.string().regex(PASSWORD_REGEX, PASSWORD_MESSAGE),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Debe ser distinta de la actual',
  });

export const createUserSchema = z.object({
  fullName: z.string().min(3, 'Mínimo 3 caracteres').max(120),
  email: z.string().min(1, 'Ingrese el correo').email('Correo inválido'),
  role: z.enum(ALL_ROLES as [string, ...string[]]),
  password: z.string().regex(PASSWORD_REGEX, PASSWORD_MESSAGE),
  documentId: z.string().max(30).optional(),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
export type CreateUserForm = z.infer<typeof createUserSchema>;
