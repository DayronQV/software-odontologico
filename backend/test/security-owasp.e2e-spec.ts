import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { clinicalSetup, ClinicalContext, makePng } from './clinical-fixtures';
import { createPatient } from './fixtures';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

/**
 * Revisión manual OWASP Top 10 automatizada: control de acceso a nivel de objeto (IDOR / A01),
 * inyección (A03), configuración (A05), identificación (A07) y manejo de errores (A09).
 */
describe('Seguridad OWASP Top 10 (Fase 4)', () => {
  let app: INestApplication;
  let ctx: ClinicalContext;
  let otherPatient: { id: string };
  let secondDentist: TestSession;
  let attachmentId: string;
  let findingId: string;
  let chartId: string;
  let noteId: string;

  const dentist = () => bearer(ctx.dentist.accessToken);

  beforeAll(async () => {
    app = await createTestApp();
    ctx = await clinicalSetup(app);
    otherPatient = await createPatient(app, ctx.reception.accessToken);
    secondDentist = await createSession(app, Role.ODONTOLOGO);

    attachmentId = (
      await http(app)
        .post(`/api/patients/${ctx.patient.id}/attachments`)
        .set(dentist())
        .field('kind', 'XRAY')
        .attach('file', makePng(40, 20), 'rx.png')
        .expect(201)
    ).body.id;
    findingId = (
      await http(app)
        .post(`/api/patients/${ctx.patient.id}/odontogram/findings`)
        .set(dentist())
        .send({ toothCode: 16, surface: 'OCCLUSAL', type: 'CARIES' })
        .expect(201)
    ).body.id;
    chartId = (
      await http(app)
        .post(`/api/patients/${ctx.patient.id}/perio-charts`)
        .set(dentist())
        .send({
          sites: ['V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL'].map((site) => ({
            toothCode: 16, site, probingDepth: 3, gingivalMargin: 0, bleeding: false,
          })),
          teeth: [{ toothCode: 16, furcation: 0, mobility: 0 }],
        })
        .expect(201)
    ).body.id;
    noteId = (
      await http(app)
        .post(`/api/patients/${ctx.patient.id}/notes`)
        .set(dentist())
        .send({ subjective: 's', objective: 'o', assessment: 'a', plan: 'p' })
        .expect(201)
    ).body.id;
  });
  afterAll(() => app.close());

  describe('A01: control de acceso a nivel de objeto (IDOR)', () => {
    it('un adjunto no se puede leer por la ruta de OTRO paciente', async () => {
      const wrong = `/api/patients/${otherPatient.id}/attachments/${attachmentId}`;
      await http(app).get(`${wrong}/content`).set(dentist()).expect(404);
      await http(app).get(`${wrong}/download-url`).set(dentist()).expect(404);
      await http(app).get(`/api/patients/${ctx.patient.id}/attachments/${attachmentId}/content`).set(dentist()).expect(200);
    });

    it('un hallazgo del odontograma no se modifica ni se retira por la ruta de otro paciente', async () => {
      const wrong = `/api/patients/${otherPatient.id}/odontogram/findings/${findingId}`;
      await http(app).patch(wrong).set(dentist()).send({ status: 'PLANNED' }).expect(404);
      await http(app).post(`${wrong}/remove`).set(dentist()).send({ reason: 'intento cruzado' }).expect(404);
    });

    it('un periodontograma de un paciente no se lee con la ruta de otro', async () => {
      await http(app).get(`/api/patients/${otherPatient.id}/perio-charts/${chartId}`).set(dentist()).expect(404);
    });

    it('la lista de notas de un paciente nunca incluye las de otro', async () => {
      const res = await http(app).get(`/api/patients/${otherPatient.id}/notes`).set(dentist()).expect(200);
      expect(res.body.some((n: { id: string }) => n.id === noteId)).toBe(false);
    });

    it('otro odontólogo no puede editar ni firmar una nota ajena', async () => {
      const other = bearer(secondDentist.accessToken);
      await http(app).patch(`/api/notes/${noteId}`).set(other).send({ plan: 'cambio ajeno' }).expect(403);
      const sign = await http(app).post(`/api/notes/${noteId}/sign`).set(other).send({ password: 'cualquiera' });
      expect([403, 404]).toContain(sign.status);
    });

    it('recepción no accede al contenido clínico y el auditor no ve pacientes', async () => {
      const reception = bearer(ctx.reception.accessToken);
      await http(app).get(`/api/patients/${ctx.patient.id}/odontogram`).set(reception).expect(403);
      await http(app).get(`/api/patients/${ctx.patient.id}/notes`).set(reception).expect(403);
      const auditor = bearer((await createSession(app, Role.AUDITOR)).accessToken);
      await http(app).get(`/api/patients/${ctx.patient.id}`).set(auditor).expect(403);
    });

    it('un ID inexistente o con formato inválido nunca revela información (404/400, sin trazas)', async () => {
      const missing = await http(app).get(`/api/patients/${randomUUID()}`).set(bearer(ctx.reception.accessToken));
      expect(missing.status).toBe(404);
      const invalid = await http(app).get('/api/patients/no-es-un-uuid').set(bearer(ctx.reception.accessToken));
      expect(invalid.status).toBe(400);
      expect(JSON.stringify(invalid.body)).not.toMatch(/prisma|stack|node_modules|SELECT/i);
    });
  });

  describe('A03: inyección', () => {
    it('una carga SQL en la búsqueda se trata como texto: no rompe ni devuelve todo', async () => {
      const payloads = ["' OR '1'='1", "'; DROP TABLE \"Patient\";--", '%27%20UNION%20SELECT%20*%20FROM%20%22User%22--'];
      for (const q of payloads) {
        const res = await http(app).get('/api/patients').query({ q }).set(bearer(ctx.reception.accessToken));
        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(0);
      }
      await http(app).get('/api/patients').set(bearer(ctx.reception.accessToken)).expect(200);
    });

    it('rechaza campos desconocidos (asignación masiva) y tipos inesperados', async () => {
      const res = await http(app)
        .post(`/api/patients/${ctx.patient.id}/notes`)
        .set(dentist())
        .send({ subjective: 's', objective: 'o', assessment: 'a', plan: 'p', authorId: randomUUID(), role: 'ADMIN_TI' });
      expect(res.status).toBe(400);
      await http(app).get('/api/audit').query({ pageSize: '1;DROP' }).set(bearer(ctx.admin.accessToken)).expect(400);
    });

    it('el HTML/JavaScript guardado se devuelve como texto sin ejecutarse (JSON, nosniff)', async () => {
      const res = await http(app)
        .post(`/api/patients/${ctx.patient.id}/notes`)
        .set(dentist())
        .send({ subjective: '<script>alert(1)</script>', objective: 'o', assessment: 'a', plan: 'p' })
        .expect(201);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('A05: configuración de seguridad', () => {
    it('las respuestas llevan las cabeceras de endurecimiento y no revelan el framework', async () => {
      const res = await http(app).get('/api/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('un origen no permitido no recibe cabeceras CORS', async () => {
      const res = await http(app).get('/api/health').set('Origin', 'https://sitio-malicioso.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('un error interno no filtra detalles de implementación', async () => {
      const res = await http(app).post('/api/auth/login').send('{"email":').set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/at \w+|node_modules|\.ts:\d+/);
    });
  });

  describe('A07: identificación y autenticación', () => {
    it('un token manipulado, ajeno o sin firma es rechazado', async () => {
      const [h, p] = ctx.dentist.accessToken.split('.');
      await http(app).get('/api/patients').set(bearer(`${h}.${p}.firma-falsa`)).expect(401);
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      await http(app).get('/api/patients').set(bearer(`${none}.${p}.`)).expect(401);
      await http(app).get('/api/patients').expect(401);
    });

    it('el mensaje de login fallido no distingue entre usuario inexistente y clave errónea', async () => {
      const unknown = await http(app).post('/api/auth/login').send({ email: 'nadie@sigo.test', password: 'Incorrecta-2026!' });
      const wrong = await http(app).post('/api/auth/login').send({ email: 'admin@sigo.test', password: 'Incorrecta-2026!' });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });
  });

  describe('A09: registro y monitoreo', () => {
    it('los accesos denegados y los ingresos fallidos quedan en el log de auditoría', async () => {
      await http(app).post('/api/auth/login').send({ email: 'nadie@sigo.test', password: 'Incorrecta-2026!' });
      const res = await http(app).get('/api/audit').query({ action: 'LOGIN_FAILED', pageSize: 5 }).set(bearer(ctx.admin.accessToken)).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });
});
