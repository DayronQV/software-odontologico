import { sanitizeBody, toEntityId } from './audit.interceptor';

describe('toEntityId', () => {
  it('convierte ids numéricos a texto y respeta los vacíos', () => {
    expect(toEntityId(1)).toBe('1');
    expect(toEntityId('abc')).toBe('abc');
    expect(toEntityId(undefined)).toBeNull();
    expect(toEntityId(null)).toBeNull();
    expect(toEntityId('')).toBeNull();
  });
});

describe('sanitizeBody', () => {
  it('oculta contraseñas, códigos y tokens', () => {
    expect(
      sanitizeBody({
        email: 'a@b.c',
        password: 'x',
        newPassword: 'y',
        recoveryCode: 'z',
        refreshToken: 't',
        role: 'ADMIN_TI',
      }),
    ).toEqual({
      email: '[REDACTED]',
      password: '[REDACTED]',
      newPassword: '[REDACTED]',
      recoveryCode: '[REDACTED]',
      refreshToken: '[REDACTED]',
      role: 'ADMIN_TI',
    });
  });

  it('oculta datos personales y clínicos también dentro de objetos y listas', () => {
    const result = sanitizeBody({
      status: 'CONFIRMED',
      patient: { firstName: 'Ana', phone: '099', birthDate: '2010-01-01', sex: 'FEMALE' },
      guardian: { fullName: 'Madre', documentId: '0102' },
      medicalHistory: { drugAllergies: ['penicilina'] },
      lines: [{ description: 'Limpieza', quantity: 1 }],
      q: '0102030405',
    });
    expect(result).toEqual({
      status: 'CONFIRMED',
      patient: {
        firstName: '[REDACTED]',
        phone: '[REDACTED]',
        birthDate: '[REDACTED]',
        sex: 'FEMALE',
      },
      guardian: { fullName: '[REDACTED]', documentId: '[REDACTED]' },
      medicalHistory: '[REDACTED]',
      lines: [{ description: 'Limpieza', quantity: 1 }],
      q: '[REDACTED]',
    });
    expect(JSON.stringify(result)).not.toMatch(/Ana|0102|penicilina|099/);
  });

  it('limita la profundidad', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(sanitizeBody(deep))).toContain('[…]');
  });

  it('ignora cuerpos que no son objetos', () => {
    expect(sanitizeBody(undefined)).toBeUndefined();
    expect(sanitizeBody('texto')).toBeUndefined();
    expect(sanitizeBody([1, 2])).toBeUndefined();
  });
});
