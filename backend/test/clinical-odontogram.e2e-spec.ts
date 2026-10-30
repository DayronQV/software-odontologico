import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext } from './clinical-fixtures';
import { bearer, createTestApp, http, sleep } from './helpers';

describe('Odontograma (RF-03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
  });
  afterAll(() => app.close());

  const base = () => `/api/patients/${ctx.patient.id}/odontogram`;
  const dentist = () => bearer(ctx.dentist.accessToken);
  const addFinding = (body: Record<string, unknown>) =>
    http(app).post(`${base()}/findings`).set(dentist()).send(body);

  it('un paciente sin odontograma recibe uno vacío de dentición permanente (sin crearlo)', async () => {
    const res = await http(app).get(base()).set(dentist()).expect(200);
    expect(res.body).toMatchObject({ dentition: 'PERMANENT', findings: [], asOf: null });
    expect(await prisma.db.odontogram.count({ where: { patientId: ctx.patient.id } })).toBe(0);
  });

  it('registra los 9 tipos del catálogo en superficie o diente completo', async () => {
    const cases: Array<[number, string, string]> = [
      [16, 'OCCLUSAL', 'CARIES'],
      [17, 'MESIAL', 'RESTORATION'],
      [18, 'OCCLUSAL', 'SEALANT'],
      [26, 'WHOLE', 'ENDODONTICS_DONE'],
      [27, 'WHOLE', 'ENDODONTICS_REQUIRED'],
      [21, 'WHOLE', 'IMPLANT'],
      [36, 'WHOLE', 'PROSTHESIS_FIXED'],
      [37, 'WHOLE', 'PROSTHESIS_REMOVABLE'],
      [48, 'WHOLE', 'EXTRACTION'],
    ];
    for (const [toothCode, surface, type] of cases) {
      const res = await addFinding({ toothCode, surface, type }).expect(201);
      expect(res.body).toMatchObject({ toothCode, surface, type, status: 'EXISTING' });
    }
    const list = await http(app).get(base()).set(dentist()).expect(200);
    expect(list.body.findings).toHaveLength(cases.length);
  });

  it('rechaza repetidos, superficie incoherente y dientes que no existen', async () => {
    await addFinding({ toothCode: 16, surface: 'OCCLUSAL', type: 'CARIES' }).expect(409);
    await addFinding({ toothCode: 16, surface: 'WHOLE', type: 'CARIES' }).expect(400);
    await addFinding({ toothCode: 16, surface: 'MESIAL', type: 'EXTRACTION' }).expect(400);
    await addFinding({ toothCode: 19, surface: 'WHOLE', type: 'EXTRACTION' }).expect(400);
    await addFinding({ toothCode: 5, surface: 'WHOLE', type: 'EXTRACTION' }).expect(400);
  });

  it('la dentición del paciente limita los dientes; la mixta admite ambos', async () => {
    await addFinding({ toothCode: 55, surface: 'OCCLUSAL', type: 'CARIES' }).expect(400);
    await http(app).put(`${base()}/dentition`).set(dentist()).send({ dentition: 'MIXED' }).expect(200);
    await addFinding({ toothCode: 55, surface: 'OCCLUSAL', type: 'CARIES' }).expect(201);
    await addFinding({ toothCode: 54, surface: 'WHOLE', type: 'IMPLANT' }).expect(400); // implante solo permanente
    const res = await http(app).get(base()).set(dentist()).expect(200);
    expect(res.body.dentition).toBe('MIXED');
  });

  it('distingue existente / planificado / realizado y conserva el historial con consulta por fecha', async () => {
    const created = await addFinding({
      toothCode: 46,
      surface: 'OCCLUSAL',
      type: 'CARIES',
      status: 'PLANNED',
    }).expect(201);
    expect(created.body.status).toBe('PLANNED');
    await sleep(30);
    const before = new Date().toISOString();
    await sleep(30);

    const done = await http(app)
      .patch(`${base()}/findings/${created.body.id}`)
      .set(dentist())
      .send({ type: 'RESTORATION', status: 'DONE' })
      .expect(200);
    expect(done.body).toMatchObject({ type: 'RESTORATION', status: 'DONE', replacesId: created.body.id });

    // Hoy: solo el hallazgo nuevo en el diente 46
    const now = await http(app).get(base()).set(dentist()).expect(200);
    const at46 = now.body.findings.filter((f: { toothCode: number }) => f.toothCode === 46);
    expect(at46).toHaveLength(1);
    expect(at46[0].status).toBe('DONE');

    // Consulta por fecha: antes del cambio se veía la caries planificada
    const past = await http(app).get(`${base()}?at=${encodeURIComponent(before)}`).set(dentist()).expect(200);
    const past46 = past.body.findings.filter((f: { toothCode: number }) => f.toothCode === 46);
    expect(past46).toHaveLength(1);
    expect(past46[0]).toMatchObject({ type: 'CARIES', status: 'PLANNED' });

    // Historial: quién y cuándo
    const history = await http(app).get(`${base()}/history?toothCode=46`).set(dentist()).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.map((h: { removedAt: string | null }) => !!h.removedAt).sort()).toEqual([false, true]);
    expect(history.body[0].createdBy).toBeTruthy();
  });

  it('quitar un hallazgo exige motivo y lo conserva en el historial', async () => {
    const created = await addFinding({ toothCode: 14, surface: 'DISTAL', type: 'CARIES' }).expect(201);
    await http(app).post(`${base()}/findings/${created.body.id}/remove`).set(dentist()).send({ reason: 'x' }).expect(400);
    await http(app)
      .post(`${base()}/findings/${created.body.id}/remove`)
      .set(dentist())
      .send({ reason: 'Registrado en el diente equivocado' })
      .expect(200);
    await http(app).post(`${base()}/findings/${created.body.id}/remove`).set(dentist()).send({ reason: 'otra vez' }).expect(409);
    const history = await http(app).get(`${base()}/history?toothCode=14`).set(dentist()).expect(200);
    expect(history.body[0]).toMatchObject({ removalReason: 'Registrado en el diente equivocado' });
  });

  it('un cambio sin diferencias se rechaza', async () => {
    const created = await addFinding({ toothCode: 13, surface: 'MESIAL', type: 'CARIES' }).expect(201);
    await http(app).patch(`${base()}/findings/${created.body.id}`).set(dentist()).send({ type: 'CARIES' }).expect(400);
  });

  describe('permisos y protección en la base de datos', () => {
    it('el asistente consulta pero no modifica; recepción no accede al contenido clínico', async () => {
      const assistant = bearer(ctx.assistant.accessToken);
      await http(app).get(base()).set(assistant).expect(200);
      await addFinding({ toothCode: 11, surface: 'MESIAL', type: 'CARIES' }).set(assistant).expect(403);
      await http(app).put(`${base()}/dentition`).set(assistant).send({ dentition: 'PRIMARY' }).expect(403);

      const reception = bearer(ctx.reception.accessToken);
      await http(app).get(base()).set(reception).expect(403);
      await http(app).get(`${base()}/history`).set(reception).expect(403);
      await http(app).get(base()).set(bearer(ctx.admin.accessToken)).expect(403);
    });

    it('el SQL directo tampoco puede borrar ni reescribir un hallazgo', async () => {
      const finding = await prisma.db.odontogramFinding.findFirstOrThrow({
        where: { odontogram: { patientId: ctx.patient.id }, removedAt: null },
      });
      await expect(
        prisma.db.$executeRaw`UPDATE "OdontogramFinding" SET "type" = 'EXTRACTION' WHERE "id" = ${finding.id}`,
      ).rejects.toThrow(/solo puede cerrarse/);
      await expect(
        prisma.db.$executeRaw`DELETE FROM "OdontogramFinding" WHERE "id" = ${finding.id}`,
      ).rejects.toThrow(/no se pueden eliminar/);
      await expect(
        prisma.db.$executeRaw`UPDATE "OdontogramFinding" SET "toothCode" = 99 WHERE "id" = ${finding.id}`,
      ).rejects.toThrow();
    });
  });
});
