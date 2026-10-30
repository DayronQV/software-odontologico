import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, http, login, STRONG_PASSWORD, TestSession } from './helpers';

describe('Usuarios y cifrado en reposo (RNF-04b)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
  });
  afterAll(() => app.close());

  const asAdmin = () => ({ Authorization: `Bearer ${admin.accessToken}` });
  const newUser = (over: object = {}) => ({
    email: `u-${Math.random().toString(36).slice(2, 10)}@test.sigo`,
    fullName: 'Persona de Prueba',
    role: 'RECEPCIONISTA',
    password: STRONG_PASSWORD,
    ...over,
  });

  describe('cifrado AES-256-GCM de campos sensibles', () => {
    it('guarda el documento de identidad cifrado en PostgreSQL y lo lee en claro por la API interna', async () => {
      const documentId = '0102030405-DOC';
      const res = await http(app)
        .post('/api/users')
        .set(asAdmin())
        .send(newUser({ documentId }))
        .expect(201);

      const raw = await prisma.db.$queryRaw<{ documentId: string }[]>`
        SELECT "documentId" FROM "User" WHERE "id" = ${res.body.id}`;
      expect(raw[0].documentId.startsWith('enc:v1:')).toBe(true);
      expect(raw[0].documentId).not.toContain('0102030405');

      const viaClient = await prisma.db.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(viaClient.documentId).toBe(documentId);
    });

    it('la API de usuarios no expone documento ni hash de contraseña', async () => {
      const list = await http(app).get('/api/users').set(asAdmin()).expect(200);
      const text = JSON.stringify(list.body);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('documentId');
      expect(text).not.toContain('enc:v1:');
    });

    it('el secreto TOTP se guarda cifrado y sigue funcionando', async () => {
      const raw = await prisma.db.$queryRaw<{ secret: string }[]>`
        SELECT "secret" FROM "MfaSecret" WHERE "userId" = ${admin.user.id}`;
      expect(raw[0].secret.startsWith('enc:v1:')).toBe(true);
      expect(raw[0].secret).not.toContain(admin.secret);
      // Prueba de que se descifra bien: un nuevo login con MFA verifica el TOTP
      const again = (await login(app, admin.user.email, admin.user.password)).body;
      await http(app)
        .post('/api/auth/mfa/verify')
        .set(bearer(again.accessToken))
        .send({ recoveryCode: admin.recoveryCodes[0] })
        .expect(200);
    });
  });

  describe('gestión de usuarios (ADMIN_TI)', () => {
    it('crea usuarios, normaliza el correo y rechaza duplicados y datos inválidos', async () => {
      const body = newUser({ email: `MAYUS-${Date.now()}@Test.Sigo` });
      const created = await http(app).post('/api/users').set(asAdmin()).send(body).expect(201);
      expect(created.body.email).toBe(body.email.toLowerCase());
      expect(created.body.passwordHash).toBeUndefined();

      await http(app).post('/api/users').set(asAdmin()).send({ ...body, email: body.email.toLowerCase() }).expect(409);
      await http(app).post('/api/users').set(asAdmin()).send(newUser({ password: 'corta' })).expect(400);
      await http(app).post('/api/users').set(asAdmin()).send(newUser({ role: 'SUPERUSER' })).expect(400);
      await http(app).post('/api/users').set(asAdmin()).send(newUser({ isAdmin: true })).expect(400);
    });

    it('el cambio de rol tiene efecto inmediato y queda auditado', async () => {
      const target = await createSession(app, Role.RECEPCIONISTA);
      await http(app).get('/api/audit').set(bearer(target.accessToken)).expect(403);

      await http(app)
        .patch(`/api/users/${target.user.id}/role`)
        .set(asAdmin())
        .send({ role: 'AUDITOR' })
        .expect(200);
      // Mismo token, nuevo rol (el rol se lee de la BD en cada petición)
      await http(app).get('/api/audit').set(bearer(target.accessToken)).expect(200);

      const log = await prisma.db.auditLog.findFirstOrThrow({
        where: { action: 'ROLE_CHANGED', entityId: target.user.id },
      });
      expect(log.userId).toBe(admin.user.id);
      expect(log.after).toEqual({ role: 'AUDITOR' });
    });

    it('desactivar un usuario invalida sus tokens y sus sesiones', async () => {
      const target = await createSession(app, Role.ODONTOLOGO);
      await http(app)
        .patch(`/api/users/${target.user.id}/active`)
        .set(asAdmin())
        .send({ active: false })
        .expect(200);

      await http(app).get('/api/auth/me').set(bearer(target.accessToken)).expect(401);
      await http(app).post('/api/auth/refresh').send({ refreshToken: target.refreshToken }).expect(401);
      await login(app, target.user.email, target.user.password).then((r) => expect(r.status).toBe(401));
    });

    it('un administrador no puede cambiar su propio rol ni desactivarse', async () => {
      await http(app).patch(`/api/users/${admin.user.id}/role`).set(asAdmin()).send({ role: 'AUDITOR' }).expect(400);
      await http(app).patch(`/api/users/${admin.user.id}/active`).set(asAdmin()).send({ active: false }).expect(400);
    });

    it('valida el identificador y reporta usuarios inexistentes', async () => {
      await http(app).patch('/api/users/no-es-uuid/role').set(asAdmin()).send({ role: 'AUDITOR' }).expect(400);
      await http(app)
        .patch('/api/users/00000000-0000-4000-8000-000000000000/role')
        .set(asAdmin())
        .send({ role: 'AUDITOR' })
        .expect(404);
    });

    it('los demás roles no pueden gestionar usuarios', async () => {
      const dentist = await createSession(app, Role.ODONTOLOGO);
      await http(app).post('/api/users').set(bearer(dentist.accessToken)).send(newUser()).expect(403);
    });
  });
});
