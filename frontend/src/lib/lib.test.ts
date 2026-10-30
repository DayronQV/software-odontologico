import { describe, expect, it } from 'vitest';
import { resolveIdleMinutes } from './env';
import { ALL_ROLES, navFor } from './roles';
import { changePasswordSchema, createUserSchema, loginSchema, PASSWORD_REGEX } from './schemas';

describe('resolveIdleMinutes (RNF-05c)', () => {
  it('usa 15 minutos por defecto y nunca más de 15', () => {
    expect(resolveIdleMinutes(undefined)).toBe(15);
    expect(resolveIdleMinutes('')).toBe(15);
    expect(resolveIdleMinutes('abc')).toBe(15);
    expect(resolveIdleMinutes('-3')).toBe(15);
    expect(resolveIdleMinutes('60')).toBe(15);
  });

  it('permite acortarlo (pruebas)', () => {
    expect(resolveIdleMinutes('5')).toBe(5);
    expect(resolveIdleMinutes('0.5')).toBe(0.5);
  });
});

describe('navFor', () => {
  it('cada rol tiene al menos inicio y su cuenta', () => {
    for (const role of ALL_ROLES) {
      const paths = navFor(role).map((i) => i.to);
      expect(paths).toEqual(expect.arrayContaining(['/', '/account/password']));
    }
  });

  it('solo el administrador gestiona usuarios; auditoría para admin y auditor', () => {
    const has = (role: (typeof ALL_ROLES)[number], to: string) => navFor(role).some((i) => i.to === to);
    expect(ALL_ROLES.filter((r) => has(r, '/users'))).toEqual(['ADMIN_TI']);
    expect(ALL_ROLES.filter((r) => has(r, '/audit'))).toEqual(['ADMIN_TI', 'AUDITOR']);
  });
});

describe('esquemas de validación', () => {
  it('la política de contraseña coincide con el backend', () => {
    expect(PASSWORD_REGEX.test('Sigo-Dev-2026!')).toBe(true);
    for (const weak of ['corta1A!', 'sinmayuscula-2026!', 'SINMINUSCULA-2026!', 'SinNumeros-Aqui!!', 'SinSimbolo2026ab']) {
      expect(PASSWORD_REGEX.test(weak)).toBe(false);
    }
  });

  it('login exige correo válido', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });

  it('cambio de contraseña: confirmación y diferencia con la actual', () => {
    const ok = { currentPassword: 'Actual-Clave-2026!', newPassword: 'Nueva-Clave-2027!', confirmPassword: 'Nueva-Clave-2027!' };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, confirmPassword: 'otra' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: ok.currentPassword, confirmPassword: ok.currentPassword }).success).toBe(false);
  });

  it('alta de usuario valida el perfil y la contraseña', () => {
    const ok = { fullName: 'Ana Pérez', email: 'ana@clinica.co', role: 'ODONTOLOGO', password: 'Nueva-Clave-2027!' };
    expect(createUserSchema.safeParse(ok).success).toBe(true);
    expect(createUserSchema.safeParse({ ...ok, role: 'ROOT' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...ok, password: 'debil' }).success).toBe(false);
  });
});
