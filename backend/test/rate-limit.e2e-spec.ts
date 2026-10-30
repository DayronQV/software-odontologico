import { INestApplication } from '@nestjs/common';

/** Protección contra fuerza bruta: el login y el MFA tienen un límite estricto por IP. */
describe('Rate limiting en login y MFA', () => {
  let app: INestApplication;
  let h: typeof import('./helpers');
  const previous = process.env.THROTTLE_AUTH_LIMIT;

  beforeAll(async () => {
    // El límite se lee al cargar los módulos: debe fijarse antes del primer import de la app
    process.env.THROTTLE_AUTH_LIMIT = '3';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    h = require('./helpers');
    app = await h.createTestApp();
  });
  afterAll(async () => {
    process.env.THROTTLE_AUTH_LIMIT = previous;
    await app.close();
  });

  it('responde 429 tras superar el límite de intentos de login', async () => {
    const attempt = () =>
      h.http(app).post('/api/auth/login').send({ email: 'x@test.sigo', password: 'Incorrecta-123!' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.statusCode).toBe(429);
  });

  it('el health check no se limita', async () => {
    for (let i = 0; i < 10; i++) await h.http(app).get('/api/health').expect(200);
  });
});
