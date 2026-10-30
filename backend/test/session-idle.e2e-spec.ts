import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { createSession as CreateSession } from './helpers';

/**
 * RNF-05c: la sesión se cierra por inactividad. Se prueba con un plazo corto (2 s) configurado
 * por entorno; en producción el plazo es de 900 s (15 min) y el esquema de configuración no
 * permite superarlo.
 */
describe('Cierre de sesión por inactividad (RNF-05c)', () => {
  let app: INestApplication;
  let h: typeof import('./helpers');
  let createSession: typeof CreateSession;
  const previous = process.env.SESSION_IDLE_SECONDS;

  beforeAll(async () => {
    process.env.SESSION_IDLE_SECONDS = '2';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    h = require('./helpers');
    createSession = h.createSession;
    app = await h.createTestApp();
  });
  afterAll(async () => {
    process.env.SESSION_IDLE_SECONDS = previous;
    await app.close();
  });

  it('la actividad renueva la sesión; la inactividad la mata', async () => {
    const s = await createSession(app, Role.ODONTOLOGO);
    const me = () => h.http(app).get('/api/auth/me').set(h.bearer(s.accessToken));

    // Dos peticiones separadas 1.3 s: en total pasan 2.6 s (> 2 s) pero la sesión sigue viva
    await h.sleep(1300);
    await me().expect(200);
    await h.sleep(1300);
    await me().expect(200);

    // Sin actividad durante más de 2 s: la sesión expira
    await h.sleep(3200);
    const expired = await me();
    expect(expired.status).toBe(401);
    expect(expired.body.message).toContain('inactividad');
  });

  it('un refresh token no puede revivir una sesión expirada', async () => {
    const s = await createSession(app, Role.ODONTOLOGO);
    await h.sleep(3200);
    const res = await h.http(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('inactividad');
  });
});
