import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext } from './clinical-fixtures';
import { bearer, createTestApp, http } from './helpers';

const SITES = ['V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL'] as const;

/** 6 puntos por diente con profundidad, recesión y sangrado dados. */
const toothSites = (toothCode: number, depths: number[], margins: number[], bleeding: boolean[]) =>
  SITES.map((site, i) => ({
    toothCode,
    site,
    probingDepth: depths[i],
    gingivalMargin: margins[i],
    bleeding: bleeding[i],
  }));

describe('Periodontograma (RF-04)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
  });
  afterAll(() => app.close());

  const base = () => `/api/patients/${ctx.patient.id}/perio-charts`;
  const dentist = () => bearer(ctx.dentist.accessToken);

  const firstExam = {
    notes: 'Primer examen',
    sites: [
      ...toothSites(16, [3, 4, 6, 2, 3, 5], [1, 0, 2, 0, 0, 1], [false, true, true, false, false, true]),
      ...toothSites(26, [2, 2, 3, 2, 2, 2], [0, 0, 0, 0, 0, 0], [false, false, false, false, false, false]),
    ],
    teeth: [
      { toothCode: 16, furcation: 2, mobility: 1 },
      { toothCode: 26, furcation: 0, mobility: 0 },
    ],
  };

  let chartId: string;

  it('captura 6 puntos por diente y calcula el NIC (profundidad + recesión) de cada punto', async () => {
    const res = await http(app).post(base()).set(dentist()).send(firstExam).expect(201);
    chartId = res.body.id;

    expect(res.body.sites).toHaveLength(12);
    const at16 = res.body.sites.filter((s: { toothCode: number }) => s.toothCode === 16);
    expect(at16.map((s: { attachmentLevel: number }) => s.attachmentLevel)).toEqual([4, 4, 8, 2, 3, 6]);
    expect(at16.find((s: { site: string }) => s.site === 'V_DISTAL')).toMatchObject({
      probingDepth: 6,
      gingivalMargin: 2,
      attachmentLevel: 8,
    });
    expect(res.body.teeth).toEqual([
      { toothCode: 16, furcation: 2, mobility: 1 },
      { toothCode: 26, furcation: 0, mobility: 0 },
    ]);
  });

  it('calcula los indicadores resumen: % de sangrado y bolsas ≥ 4 mm', async () => {
    const res = await http(app).get(`${base()}/${chartId}`).set(dentist()).expect(200);
    expect(res.body.summary).toMatchObject({
      sites: 12,
      teeth: 2,
      bleedingSites: 3,
      bleedingPercent: 25,
      pocketSites: 3,
      pocketPercent: 25,
    });
    const list = await http(app).get(base()).set(dentist()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ finalized: false });
  });

  it('valida los rangos clínicos', async () => {
    const invalid = (patch: Record<string, unknown>) =>
      http(app)
        .post(base())
        .set(dentist())
        .send({ sites: [{ ...firstExam.sites[0], ...patch }], teeth: [] });
    await invalid({ probingDepth: 16 }).expect(400);
    await invalid({ probingDepth: -1 }).expect(400);
    await invalid({ gingivalMargin: 16 }).expect(400);
    await invalid({ site: 'OTRO' }).expect(400);
    await invalid({ toothCode: 19 }).expect(400); // no existe en FDI
    await http(app)
      .post(base())
      .set(dentist())
      .send({ sites: [firstExam.sites[0], firstExam.sites[0]], teeth: [] })
      .expect(400); // punto repetido
    await http(app)
      .post(base())
      .set(dentist())
      .send({ sites: [], teeth: [{ toothCode: 16, furcation: 4, mobility: 0 }] })
      .expect(400);
    await http(app)
      .post(base())
      .set(dentist())
      .send({ sites: [], teeth: [{ toothCode: 16, furcation: 0, mobility: 4 }] })
      .expect(400);
  });

  it('un examen abierto se puede corregir; al finalizarlo queda congelado', async () => {
    const edited = {
      ...firstExam,
      sites: firstExam.sites.map((s) => (s.toothCode === 16 && s.site === 'V_DISTAL' ? { ...s, probingDepth: 7 } : s)),
    };
    const put = await http(app).put(`${base()}/${chartId}`).set(dentist()).send(edited).expect(200);
    expect(put.body.sites.find((s: { toothCode: number; site: string }) => s.toothCode === 16 && s.site === 'V_DISTAL').attachmentLevel).toBe(9);

    await http(app).post(`${base()}/${chartId}/finalize`).set(dentist()).expect(200);
    await http(app).post(`${base()}/${chartId}/finalize`).set(dentist()).expect(409);
    await http(app).put(`${base()}/${chartId}`).set(dentist()).send(firstExam).expect(409);

    // y la base de datos lo impide aunque se salte la aplicación
    await expect(
      prisma.db.$executeRaw`UPDATE "PerioSiteReading" SET "probingDepth" = 1 WHERE "chartId" = ${chartId}`,
    ).rejects.toThrow(/finalizado/);
    await expect(
      prisma.db.$executeRaw`DELETE FROM "PerioSiteReading" WHERE "chartId" = ${chartId}`,
    ).rejects.toThrow(/finalizado/);
    await expect(prisma.db.$executeRaw`DELETE FROM "PerioChart" WHERE "id" = ${chartId}`).rejects.toThrow();
  });

  it('no se finaliza un examen sin mediciones', async () => {
    const empty = await http(app).post(base()).set(dentist()).send({ sites: [], teeth: [] }).expect(201);
    await http(app).post(`${base()}/${empty.body.id}/finalize`).set(dentist()).expect(400);
  });

  it('compara dos exámenes: evolución punto por punto e indicadores', async () => {
    const better = {
      sites: [
        ...toothSites(16, [3, 3, 4, 2, 3, 3], [1, 0, 2, 0, 0, 1], [false, false, true, false, false, false]),
        ...toothSites(26, [2, 2, 3, 2, 2, 5], [0, 0, 0, 0, 0, 0], [false, false, false, false, false, false]),
      ],
      teeth: [],
    };
    const second = await http(app).post(base()).set(dentist()).send(better).expect(201);
    const res = await http(app)
      .get(`${base()}/compare?before=${chartId}&after=${second.body.id}`)
      .set(dentist())
      .expect(200);

    expect(res.body.before.id).toBe(chartId);
    expect(res.body.after.id).toBe(second.body.id);
    expect(res.body.improved).toBeGreaterThan(0);
    expect(res.body.worsened).toBe(1); // 26 distal lingual: 2 → 5
    expect(res.body.after.summary.bleedingPercent).toBeLessThan(res.body.before.summary.bleedingPercent);
    const worse = res.body.changes.find((c: { toothCode: number; site: string }) => c.toothCode === 26 && c.site === 'L_DISTAL');
    expect(worse).toMatchObject({ probingDepthChange: 3, attachmentLevelChange: 3 });
  });

  it('el asistente consulta pero no captura; recepción no accede', async () => {
    const assistant = bearer(ctx.assistant.accessToken);
    await http(app).get(base()).set(assistant).expect(200);
    await http(app).post(base()).set(assistant).send(firstExam).expect(403);
    await http(app).get(base()).set(bearer(ctx.reception.accessToken)).expect(403);
  });
});

describe('Signos vitales', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
  });
  afterAll(() => app.close());

  const base = () => `/api/patients/${ctx.patient.id}/vital-signs`;

  it('el asistente los registra y el odontólogo los consulta', async () => {
    const created = await http(app)
      .post(base())
      .set(bearer(ctx.assistant.accessToken))
      .send({ systolic: 120, diastolic: 80, pulse: 72, temperatureC: 36.5, oxygenSaturation: 98, weightKg: 70.5 })
      .expect(201);
    expect(created.body).toMatchObject({ systolic: 120, diastolic: 80, temperatureC: 36.5, weightKg: 70.5 });

    const list = await http(app).get(base()).set(bearer(ctx.dentist.accessToken)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].recordedBy).toBeTruthy();
  });

  it('valida rangos y exige al menos una medición', async () => {
    const post = (body: Record<string, unknown>) =>
      http(app).post(base()).set(bearer(ctx.assistant.accessToken)).send(body);
    await post({}).expect(400);
    await post({ pulse: 500 }).expect(400);
    await post({ oxygenSaturation: 101 }).expect(400);
    await post({ systolic: 80, diastolic: 90 }).expect(400); // diastólica ≥ sistólica
  });

  it('recepción no los ve y los registros no se modifican', async () => {
    await http(app).get(base()).set(bearer(ctx.reception.accessToken)).expect(403);
    await expect(prisma.db.$executeRaw`UPDATE "VitalSigns" SET "pulse" = 60 WHERE "patientId" = ${ctx.patient.id}`).rejects.toThrow(
      /no se pueden modificar/,
    );
    await expect(prisma.db.$executeRaw`DELETE FROM "VitalSigns" WHERE "patientId" = ${ctx.patient.id}`).rejects.toThrow(
      /no se pueden eliminar/,
    );
  });
});
