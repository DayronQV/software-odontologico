import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

describe('Telemetría del sistema (admin)', () => {
  let app: INestApplication;
  const sessions = {} as Record<Role, TestSession>;

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of Object.values(Role)) sessions[role] = await createSession(app, role);
  });
  afterAll(() => app.close());

  it('el administrador ve servicios, latencias, cola y actividad de 24 h', async () => {
    const res = await http(app).get('/api/system/status').set(bearer(sessions.ADMIN_TI.accessToken)).expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.database.status).toBe('up');
    expect(res.body.services.redis.status).toBe('up');
    expect(typeof res.body.services.database.latencyMs).toBe('number');
    expect(res.body.database.sizeMb).toBeGreaterThanOrEqual(0);
    expect(res.body.activity24h.auditEntries).toBeGreaterThan(0);
    expect(res.body.queue).toEqual(expect.objectContaining({ waiting: expect.any(Number), failed: expect.any(Number) }));
  });

  it('la lista de respaldos responde aunque el almacenamiento de respaldos no esté configurado', async () => {
    const res = await http(app).get('/api/system/backups').set(bearer(sessions.ADMIN_TI.accessToken)).expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.configured).toBe('boolean');
  });

  it.each([Role.RECEPCIONISTA, Role.ODONTOLOGO, Role.ASISTENTE, Role.AUDITOR])('%s no puede ver la telemetría ni los respaldos', async (role) => {
    await http(app).get('/api/system/status').set(bearer(sessions[role].accessToken)).expect(403);
    await http(app).get('/api/system/backups').set(bearer(sessions[role].accessToken)).expect(403);
  });

  it('exige autenticación', async () => {
    await http(app).get('/api/system/status').expect(401);
  });
});
