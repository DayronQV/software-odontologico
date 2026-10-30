import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bearer,
  createSession,
  createTestApp,
  createUser,
  http,
  login,
  STRONG_PASSWORD,
  totpCode,
} from './helpers';

describe('Autenticación, MFA y sesiones (RNF-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());

  const refresh = (refreshToken: string) => http(app).post('/api/auth/refresh').send({ refreshToken });

  describe('login', () => {
    it('rechaza una contraseña incorrecta y lo registra en auditoría', async () => {
      const user = await createUser(app, Role.RECEPCIONISTA);
      const res = await login(app, user.email, 'Incorrecta-123!');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas');
      const log = await prisma.db.auditLog.findFirst({
        where: { action: 'LOGIN_FAILED', userId: user.id },
      });
      expect(log).not.toBeNull();
      expect(log?.ip).toBeTruthy();
    });

    it('no revela si el usuario existe (mismo mensaje)', async () => {
      const res = await login(app, 'no-existe@test.sigo', STRONG_PASSWORD);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas');
    });

    it('valida el cuerpo y rechaza campos desconocidos', async () => {
      await http(app).post('/api/auth/login').send({ email: 'no-es-correo', password: 'x' }).expect(400);
      await http(app)
        .post('/api/auth/login')
        .send({ email: 'a@b.co', password: 'x', isAdmin: true })
        .expect(400);
    });

    it('un usuario inactivo no puede ingresar', async () => {
      const user = await createUser(app, Role.ASISTENTE);
      await prisma.db.user.update({ where: { id: user.id }, data: { active: false } });
      await login(app, user.email, user.password).then((r) => expect(r.status).toBe(401));
    });

    it('el login emite un token SIN MFA que no da acceso a recursos protegidos', async () => {
      const user = await createUser(app, Role.ADMIN_TI);
      const res = await login(app, user.email, user.password);
      expect(res.status).toBe(200);
      expect(res.body.mfa).toEqual({ enrolled: false, verified: false });
      expect(res.body.user).toEqual(expect.objectContaining({ email: user.email, role: 'ADMIN_TI' }));
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const blocked = await http(app).get('/api/users').set(bearer(res.body.accessToken));
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toContain('MFA');

      const me = await http(app).get('/api/auth/me').set(bearer(res.body.accessToken)).expect(200);
      expect(me.body.mfaVerified).toBe(false);
    });

    it('rechaza tokens ausentes, mal formados o con la firma alterada', async () => {
      await http(app).get('/api/auth/me').expect(401);
      await http(app).get('/api/auth/me').set(bearer('no.es.un.jwt')).expect(401);
      const s = await createSession(app, Role.ADMIN_TI);
      const forged = s.accessToken.slice(0, -4) + 'AAAA';
      await http(app).get('/api/users').set(bearer(forged)).expect(401);
    });
  });

  describe('MFA (TOTP)', () => {
    it('enrolamiento completo: secreto + QR → código → tokens completos + códigos de recuperación', async () => {
      const user = await createUser(app, Role.ADMIN_TI);
      const partial = (await login(app, user.email, user.password)).body;

      const setup = await http(app)
        .post('/api/auth/mfa/setup')
        .set(bearer(partial.accessToken))
        .expect(200);
      expect(setup.body.secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
      expect(setup.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);

      await http(app)
        .post('/api/auth/mfa/enable')
        .set(bearer(partial.accessToken))
        .send({ code: '000000' })
        .expect(401);
      await http(app)
        .post('/api/auth/mfa/enable')
        .set(bearer(partial.accessToken))
        .send({ code: 'abc' })
        .expect(400);

      const enabled = await http(app)
        .post('/api/auth/mfa/enable')
        .set(bearer(partial.accessToken))
        .send({ code: totpCode(setup.body.secret) })
        .expect(200);
      expect(enabled.body.recoveryCodes).toHaveLength(8);
      expect(enabled.body.recoveryCodes[0]).toMatch(/^[0-9A-F]{10}-[0-9A-F]{10}$/);

      // El token completo ya accede a recursos protegidos
      await http(app).get('/api/users').set(bearer(enabled.body.accessToken)).expect(200);
      // Los códigos de recuperación se guardan solo como hash
      const record = await prisma.db.mfaSecret.findUnique({ where: { userId: user.id } });
      expect(record?.confirmed).toBe(true);
      expect(record?.recoveryCodes.join()).not.toContain(enabled.body.recoveryCodes[0]);
    });

    it('no permite volver a configurar un MFA ya confirmado', async () => {
      const s = await createSession(app, Role.ODONTOLOGO);
      await http(app).post('/api/auth/mfa/setup').set(bearer(s.accessToken)).expect(409);
    });

    it('en el siguiente login pide verificar y acepta el TOTP correcto', async () => {
      const s = await createSession(app, Role.ODONTOLOGO);
      const again = (await login(app, s.user.email, s.user.password)).body;
      expect(again.mfa).toEqual({ enrolled: true, verified: false });

      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ code: '123456' })
        .expect(401);
      await http(app).post('/api/auth/mfa/verify').set(bearer(again.accessToken)).send({}).expect(400);

      const ok = await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ code: totpCode(s.secret, 1) })
        .expect(200);
      await http(app).get('/api/auth/me').set(bearer(ok.body.accessToken)).expect(200);
      const me = await http(app).get('/api/auth/me').set(bearer(ok.body.accessToken));
      expect(me.body.mfaVerified).toBe(true);
    });

    it('no acepta reutilizar un código TOTP ya consumido (anti-replay)', async () => {
      const s = await createSession(app, Role.ODONTOLOGO);
      const again = (await login(app, s.user.email, s.user.password)).body;
      // El código del paso anterior es válido en tiempo, pero ya fue consumido o es más viejo
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ code: totpCode(s.secret, -1) })
        .expect(401);
    });

    it('los códigos de recuperación funcionan una sola vez', async () => {
      const s = await createSession(app, Role.AUDITOR);
      const code = s.recoveryCodes[0];

      const first = (await login(app, s.user.email, s.user.password)).body;
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(first.accessToken))
        .send({ recoveryCode: code })
        .expect(200);

      const second = (await login(app, s.user.email, s.user.password)).body;
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(second.accessToken))
        .send({ recoveryCode: code })
        .expect(401);
      // Otro código distinto sí sirve
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(second.accessToken))
        .send({ recoveryCode: s.recoveryCodes[1] })
        .expect(200);
    });

    it('audita enrolamiento, verificaciones y fallos de MFA', async () => {
      const s = await createSession(app, Role.ASISTENTE);
      const again = (await login(app, s.user.email, s.user.password)).body;
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ code: '111111' })
        .expect(401);
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ recoveryCode: s.recoveryCodes[0] })
        .expect(200);

      const actions = (
        await prisma.db.auditLog.findMany({ where: { userId: s.user.id }, select: { action: true } })
      ).map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining(['LOGIN', 'MFA_ENABLED', 'MFA_FAILED', 'MFA_RECOVERY_USED']),
      );
    });
  });

  describe('refresh tokens', () => {
    it('rota el refresh token y conserva el estado de MFA', async () => {
      const s = await createSession(app, Role.ADMIN_TI);
      const rotated = await refresh(s.refreshToken).expect(200);
      expect(rotated.body.refreshToken).not.toBe(s.refreshToken);
      await http(app).get('/api/users').set(bearer(rotated.body.accessToken)).expect(200);
    });

    it('detecta la reutilización de un token rotado y cierra toda la sesión', async () => {
      const s = await createSession(app, Role.ADMIN_TI);
      const rotated = await refresh(s.refreshToken).expect(200);

      await refresh(s.refreshToken).expect(401); // reuso del token viejo
      await refresh(rotated.body.refreshToken).expect(401); // el nuevo también murió
      await http(app).get('/api/auth/me').set(bearer(rotated.body.accessToken)).expect(401);

      const reuse = await prisma.db.auditLog.findFirst({
        where: { action: 'TOKEN_REUSE_DETECTED', userId: s.user.id },
      });
      expect(reuse).not.toBeNull();
    });

    it('rechaza tokens desconocidos', async () => {
      await refresh('token-que-no-existe').expect(401);
      await http(app).post('/api/auth/refresh').send({}).expect(400);
    });
  });

  describe('logout y cambio de contraseña', () => {
    it('logout revoca el acceso y el refresh token', async () => {
      const s = await createSession(app, Role.RECEPCIONISTA);
      await http(app).post('/api/auth/logout').set(bearer(s.accessToken)).expect(204);
      await http(app).get('/api/auth/me').set(bearer(s.accessToken)).expect(401);
      await refresh(s.refreshToken).expect(401);
    });

    it('cambia la contraseña, valida la política y cierra las demás sesiones', async () => {
      const s = await createSession(app, Role.ODONTOLOGO);
      const other = (await login(app, s.user.email, s.user.password)).body; // otra sesión

      const change = (body: object) =>
        http(app).post('/api/auth/change-password').set(bearer(s.accessToken)).send(body);

      await change({ currentPassword: 'Incorrecta-123!', newPassword: 'Nueva-Contrasena-2027!' }).expect(401);
      await change({ currentPassword: s.user.password, newPassword: 'debil' }).expect(400);
      await change({ currentPassword: s.user.password, newPassword: s.user.password }).expect(400);
      await change({ currentPassword: s.user.password, newPassword: 'Nueva-Contrasena-2027!' }).expect(204);

      await login(app, s.user.email, s.user.password).then((r) => expect(r.status).toBe(401));
      await login(app, s.user.email, 'Nueva-Contrasena-2027!').then((r) => expect(r.status).toBe(200));
      await http(app).get('/api/auth/me').set(bearer(s.accessToken)).expect(200); // sesión actual sigue
      await http(app).get('/api/auth/me').set(bearer(other.accessToken)).expect(401); // la otra, cerrada
    });
  });
});
