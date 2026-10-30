import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, http, STRONG_PASSWORD, TestSession } from './helpers';

describe('Auditoría inmutable (RNF-06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let admin: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    admin = await createSession(app, Role.ADMIN_TI);
  });
  afterAll(() => app.close());

  const verify = () => http(app).get('/api/audit/verify').set(bearer(admin.accessToken));

  describe('inmutabilidad en la base de datos', () => {
    it('rechaza UPDATE, DELETE y TRUNCATE por SQL directo', async () => {
      const row = await prisma.db.auditLog.findFirstOrThrow();
      await expect(
        prisma.db.$executeRaw`UPDATE "AuditLog" SET "action" = 'X' WHERE "id" = ${row.id}`,
      ).rejects.toThrow(/inmutable/);
      await expect(
        prisma.db.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${row.id}`,
      ).rejects.toThrow(/inmutable/);
      await expect(prisma.db.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"')).rejects.toThrow(/inmutable/);
      await expect(prisma.db.auditLog.deleteMany()).rejects.toThrow();
      await expect(prisma.db.auditLog.updateMany({ data: { action: 'X' } })).rejects.toThrow();
    });
  });

  describe('cadena de hashes', () => {
    it('es válida tras la actividad normal', async () => {
      const res = await verify().expect(200);
      expect(res.body).toEqual(expect.objectContaining({ valid: true }));
      expect(res.body.checked).toBeGreaterThan(0);
    });

    it('sigue siendo válida con escrituras concurrentes (bloqueo de cadena)', async () => {
      await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          audit.record({ action: 'CONCURRENT', entity: 'Test', entityId: String(i), userId: admin.user.id }),
        ),
      );
      const count = await prisma.db.auditLog.count({ where: { action: 'CONCURRENT' } });
      expect(count).toBe(25);
      expect((await verify().expect(200)).body.valid).toBe(true);
    });

    it('detecta un registro alterado (simulación con el trigger desactivado)', async () => {
      const target = await prisma.db.auditLog.findFirstOrThrow({ orderBy: { id: 'asc' }, skip: 2 });
      await prisma.db.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete',
      );
      try {
        await prisma.db.$executeRaw`UPDATE "AuditLog" SET "action" = 'MANIPULADO' WHERE "id" = ${target.id}`;
        const tampered = (await verify().expect(200)).body;
        expect(tampered.valid).toBe(false);
        expect(tampered.firstInvalidId).toBe(target.id.toString());
        expect(tampered.reason).toContain('alterado');
      } finally {
        await prisma.db.$executeRaw`UPDATE "AuditLog" SET "action" = ${target.action} WHERE "id" = ${target.id}`;
        await prisma.db.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete');
      }
      expect((await verify().expect(200)).body.valid).toBe(true);
    });

    it('detecta un registro eliminado (rompe el encadenamiento)', async () => {
      const target = await prisma.db.auditLog.findFirstOrThrow({ orderBy: { id: 'asc' }, skip: 3 });
      await prisma.db.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete',
      );
      try {
        await prisma.db.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${target.id}`;
        const result = (await verify().expect(200)).body;
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('prevHash');
      } finally {
        await prisma.db.$executeRaw`
          INSERT INTO "AuditLog" ("id","timestamp","userId","role","action","entity","entityId","ip","userAgent","before","after","prevHash","hash")
          VALUES (${target.id}, ${target.timestamp}, ${target.userId}, ${target.role}::"Role", ${target.action},
                  ${target.entity}, ${target.entityId}, ${target.ip}, ${target.userAgent},
                  ${target.before === null ? null : JSON.stringify(target.before)}::jsonb,
                  ${target.after === null ? null : JSON.stringify(target.after)}::jsonb,
                  ${target.prevHash}, ${target.hash})`;
        await prisma.db.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete');
      }
      expect((await verify().expect(200)).body.valid).toBe(true);
    });
  });

  describe('interceptor global (entidades auditadas)', () => {
    it('registra lecturas con usuario, rol e IP', async () => {
      await http(app).get('/api/users').set(bearer(admin.accessToken)).expect(200);
      const log = await prisma.db.auditLog.findFirstOrThrow({
        where: { userId: admin.user.id, entity: 'User', action: 'READ' },
        orderBy: { id: 'desc' },
      });
      expect(log.role).toBe('ADMIN_TI');
      expect(log.ip).toBeTruthy();
      expect(log.userAgent === null || typeof log.userAgent === 'string').toBe(true);
      expect(log.timestamp.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    });

    it('registra escrituras sin guardar contraseñas', async () => {
      const email = `nuevo-${Date.now()}@test.sigo`;
      const created = await http(app)
        .post('/api/users')
        .set(bearer(admin.accessToken))
        .send({ email, fullName: 'Persona Nueva', role: 'ASISTENTE', password: STRONG_PASSWORD })
        .expect(201);

      const log = await prisma.db.auditLog.findFirstOrThrow({
        where: { action: 'CREATE', entity: 'User', entityId: created.body.id },
      });
      expect(log.userId).toBe(admin.user.id);
      expect(JSON.stringify(log.after)).toContain('[REDACTED]');
      expect(JSON.stringify(log.after)).not.toContain(STRONG_PASSWORD);
    });
  });

  describe('consulta de logs', () => {
    it('filtra y pagina', async () => {
      const res = await http(app)
        .get('/api/audit')
        .query({ action: 'CONCURRENT', pageSize: 10, page: 2 })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(res.body.total).toBe(25);
      expect(res.body.items).toHaveLength(10);
      expect(res.body.page).toBe(2);
      expect(res.body.items.every((i: { action: string }) => i.action === 'CONCURRENT')).toBe(true);
      expect(typeof res.body.items[0].id).toBe('string'); // BigInt serializado
    });

    it('filtra por rango de fechas y valida los parámetros', async () => {
      const future = await http(app)
        .get('/api/audit')
        .query({ from: '2999-01-01T00:00:00Z' })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(future.body.total).toBe(0);

      await http(app).get('/api/audit').query({ pageSize: 1000 }).set(bearer(admin.accessToken)).expect(400);
      await http(app).get('/api/audit').query({ from: 'ayer' }).set(bearer(admin.accessToken)).expect(400);
      await http(app).get('/api/audit').query({ userId: 'no-uuid' }).set(bearer(admin.accessToken)).expect(400);
    });

    it('el rol Auditor puede consultar; el Odontólogo no', async () => {
      const auditor = await createSession(app, Role.AUDITOR);
      const dentist = await createSession(app, Role.ODONTOLOGO);
      await http(app).get('/api/audit').set(bearer(auditor.accessToken)).expect(200);
      await http(app).get('/api/audit').set(bearer(dentist.accessToken)).expect(403);
    });
  });
});
