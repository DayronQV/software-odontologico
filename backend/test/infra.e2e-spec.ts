import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../src/queue/queue.module';
import { bearer, createSession, createTestApp, http, login } from './helpers';

describe('Infraestructura: health, Swagger, archivos, colas y seed', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  describe('health y cabeceras', () => {
    it('GET /api/health reporta base de datos y Redis', async () => {
      const res = await http(app).get('/api/health').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ status: 'ok', db: 'up', redis: 'up' }));
    });

    it('aplica cabeceras de seguridad (Helmet) y oculta la tecnología', async () => {
      const res = await http(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('los errores tienen formato uniforme y no filtran trazas', async () => {
      const res = await http(app).get('/api/no-existe').expect(404);
      expect(res.body).toEqual(
        expect.objectContaining({ statusCode: 404, path: '/api/no-existe', timestamp: expect.any(String) }),
      );
      expect(JSON.stringify(res.body)).not.toContain('at ');
    });
  });

  describe('Swagger / OpenAPI 3.0', () => {
    it('documenta los endpoints de auth, users, audit, files y health', async () => {
      const res = await http(app).get('/api/docs-json').expect(200);
      expect(res.body.openapi).toMatch(/^3\.0/);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/api/auth/login',
          '/api/auth/refresh',
          '/api/auth/logout',
          '/api/auth/me',
          '/api/auth/change-password',
          '/api/auth/mfa/setup',
          '/api/auth/mfa/enable',
          '/api/auth/mfa/verify',
          '/api/users',
          '/api/users/{id}/role',
          '/api/users/{id}/active',
          '/api/audit',
          '/api/audit/verify',
          '/api/files/upload-url',
          '/api/files/download-url',
          '/api/health',
        ]),
      );
      expect(res.body.components.securitySchemes.bearer).toBeDefined();
    });

    it('sirve la interfaz de Swagger en /api/docs', async () => {
      const res = await http(app).get('/api/docs').expect(200);
      expect(res.text).toContain('swagger');
    });
  });

  describe('archivos en almacenamiento S3 (MinIO) con URLs firmadas', () => {
    it('sube y descarga un archivo, cifrado en reposo (SSE)', async () => {
      const dentist = await createSession(app, Role.ODONTOLOGO);
      const up = await http(app)
        .post('/api/files/upload-url')
        .set(bearer(dentist.accessToken))
        .send({ filename: 'radiografía panorámica.png', contentType: 'image/png' })
        .expect(200);
      expect(up.body.key).toMatch(/^uploads\//);

      const content = Buffer.from('contenido-binario-de-prueba');
      const put = await fetch(up.body.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: content,
      });
      expect(put.status).toBe(200);

      const down = await http(app)
        .get('/api/files/download-url')
        .query({ key: up.body.key })
        .set(bearer(dentist.accessToken))
        .expect(200);
      const got = await fetch(down.body.url);
      expect(got.status).toBe(200);
      expect(Buffer.from(await got.arrayBuffer()).equals(content)).toBe(true);
      expect(got.headers.get('x-amz-server-side-encryption')).toBe('AES256');

      // La descarga queda auditada
      const prisma = app.get(PrismaService);
      const log = await prisma.db.auditLog.findFirst({
        where: { entity: 'File', action: 'READ', userId: dentist.user.id },
      });
      expect(log).not.toBeNull();
    });

    it('valida tipo de contenido y clave, y respeta los roles', async () => {
      const dentist = await createSession(app, Role.ODONTOLOGO);
      const receptionist = await createSession(app, Role.RECEPCIONISTA);
      const upload = (token: string, contentType: string) =>
        http(app)
          .post('/api/files/upload-url')
          .set(bearer(token))
          .send({ filename: 'x.bin', contentType });

      expect((await upload(dentist.accessToken, 'text/html')).status).toBe(400);
      expect((await upload(receptionist.accessToken, 'image/png')).status).toBe(403);
      await http(app)
        .get('/api/files/download-url')
        .query({ key: 'otra-carpeta/secreto.txt' })
        .set(bearer(dentist.accessToken))
        .expect(400);
    });
  });

  describe('cola de notificaciones (BullMQ sobre Redis)', () => {
    it('la cola está registrada y conectada (sin jobs en Fase 0)', async () => {
      const queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
      expect(counts).toMatchObject({ waiting: 0, active: 0, delayed: 0 });
    });
  });

  describe('usuarios semilla (uno por rol)', () => {
    it('existen los 5 roles y se puede iniciar sesión con ellos', async () => {
      const prisma = app.get(PrismaService);
      const seeded = await prisma.db.user.findMany({
        where: { email: { endsWith: '@sigo.test' } },
        select: { email: true, role: true },
      });
      expect(seeded.map((u) => u.role).sort()).toEqual(
        ['ADMIN_TI', 'ASISTENTE', 'AUDITOR', 'ODONTOLOGO', 'RECEPCIONISTA'].sort(),
      );
      const res = await login(app, 'odontologo@sigo.test', process.env.SEED_PASSWORD as string);
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('ODONTOLOGO');
    });
  });
});
