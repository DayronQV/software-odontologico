import { sanitizeBody } from './audit.interceptor';

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
      email: 'a@b.c',
      password: '[REDACTED]',
      newPassword: '[REDACTED]',
      recoveryCode: '[REDACTED]',
      refreshToken: '[REDACTED]',
      role: 'ADMIN_TI',
    });
  });

  it('ignora cuerpos que no son objetos', () => {
    expect(sanitizeBody(undefined)).toBeUndefined();
    expect(sanitizeBody('texto')).toBeUndefined();
    expect(sanitizeBody([1, 2])).toBeUndefined();
  });
});
