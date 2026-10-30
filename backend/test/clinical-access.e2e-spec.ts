import { INestApplication } from '@nestjs/common';
import { FindingStatus, FindingType, Role, ToothSurface } from '@prisma/client';
import { archTeeth } from '../src/clinical/domain/tooth-notation';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext } from './clinical-fixtures';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

const CLINICAL: Role[] = [Role.ODONTOLOGO, Role.ASISTENTE];
const ALL: Role[] = [Role.ADMIN_TI, Role.RECEPCIONISTA, Role.ODONTOLOGO, Role.ASISTENTE, Role.AUDITOR];

describe('Acceso al contenido clínico (RBAC)', () => {
  let app: INestApplication;
  let ctx: ClinicalContext;
  const sessions = {} as Record<Role, TestSession>;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = await clinicalSetup(app);
    for (const role of ALL) sessions[role] = await createSession(app, role);
  });
  afterAll(() => app.close());

  const status = (role: Role, path: string) =>
    http(app)
      .get(path)
      .set(bearer(sessions[role].accessToken))
      .then((r) => r.status);

  // Todo el contenido clínico es solo para odontólogos y asistentes: recepción, administrador y auditor NO entran.
  const clinicalPaths = (id: string): string[] => [
    `/api/patients/${id}/odontogram`,
    `/api/patients/${id}/odontogram/history`,
    `/api/patients/${id}/perio-charts`,
    `/api/patients/${id}/notes`,
    `/api/patients/${id}/vital-signs`,
    `/api/patients/${id}/procedure-records`,
    `/api/patients/${id}/consents`,
    `/api/patients/${id}/prescriptions`,
    `/api/patients/${id}/attachments`,
    `/api/patients/${id}/timeline`,
    `/api/patients/${id}/treatment-plans`,
  ];

  it.each(clinicalPaths('00000000-0000-4000-8000-000000000000').map((p) => [p.replace(/^\/api\/patients\/[^/]+/, '')]))(
    '%s: solo odontólogo y asistente',
    async (suffix) => {
      const path = `/api/patients/${ctx.patient.id}${suffix}`;
      for (const role of ALL) {
        const expected = CLINICAL.includes(role) ? 200 : 403;
        expect({ role, status: await status(role, path) }).toEqual({ role, status: expected });
      }
    },
  );

  it('recepción solo ve las tareas agendables (sin importes ni contenido clínico)', async () => {
    const path = `/api/patients/${ctx.patient.id}/schedulable-items`;
    for (const role of ALL) {
      const patientStaff: Role[] = [Role.RECEPCIONISTA, Role.ODONTOLOGO, Role.ASISTENTE];
      const expected = patientStaff.includes(role) ? 200 : 403;
      expect({ role, status: await status(role, path) }).toEqual({ role, status: expected });
    }
  });

  it('catálogos clínicos: el administrador los mantiene y el personal clínico los consulta', async () => {
    for (const path of ['/api/clinical/medications', '/api/clinical/consent-templates']) {
      for (const role of ALL) {
        const expected = [Role.ADMIN_TI, ...CLINICAL].includes(role) ? 200 : 403;
        expect({ path, role, status: await status(role, path) }).toEqual({ path, role, status: expected });
      }
    }
    for (const role of ALL) {
      expect({ role, status: await status(role, '/api/budgets/pending-authorization') }).toEqual({
        role,
        status: role === Role.ADMIN_TI ? 200 : 403,
      });
    }
  });

  it('nadie accede sin sesión', async () => {
    await http(app).get(`/api/patients/${ctx.patient.id}/odontogram`).expect(401);
    await http(app).get(`/api/patients/${ctx.patient.id}/notes`).expect(401);
  });
});

describe('Rendimiento del expediente con odontograma (RNF-01: < 1,5 s)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dentist: TestSession;
  let patientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const ctx = await clinicalSetup(app);
    dentist = ctx.dentist;
    patientId = ctx.patient.id;

    // Datos realistas y exigentes: 52 dientes × 5 superficies, con 3 revisiones históricas cada una (≈ 800 filas)
    const odontogram = await prisma.db.odontogram.create({ data: { patientId, dentition: 'MIXED' } });
    const surfaces = [ToothSurface.MESIAL, ToothSurface.DISTAL, ToothSurface.OCCLUSAL, ToothSurface.VESTIBULAR, ToothSurface.LINGUAL];
    const teeth = [
      ...archTeeth('UPPER', 'PERMANENT'),
      ...archTeeth('LOWER', 'PERMANENT'),
      ...archTeeth('UPPER', 'PRIMARY'),
      ...archTeeth('LOWER', 'PRIMARY'),
    ];
    const rows = teeth.flatMap((toothCode) =>
      surfaces.flatMap((surface, index) =>
        [0, 1, 2].map((revision) => ({
          odontogramId: odontogram.id,
          toothCode,
          surface,
          type: index % 2 === 0 ? FindingType.CARIES : FindingType.RESTORATION,
          status: FindingStatus.EXISTING,
          createdById: dentist.user.id,
          removedAt: revision < 2 ? new Date(Date.now() - (3 - revision) * 86_400_000) : null,
          removedById: revision < 2 ? dentist.user.id : null,
          removalReason: revision < 2 ? 'Actualizado' : null,
        })),
      ),
    );
    await prisma.db.odontogramFinding.createMany({ data: rows });
    // y un periodontograma completo, como el del seed
    await prisma.db.vitalSigns.create({ data: { patientId, recordedById: dentist.user.id, pulse: 70 } });
  });
  afterAll(() => app.close());

  const auth = () => bearer(dentist.accessToken);

  /** Lo que carga el expediente al abrirse: ficha, alertas, odontograma, línea de tiempo, notas y signos vitales. */
  const loadRecord = () =>
    Promise.all([
      http(app).get(`/api/patients/${patientId}`).set(auth()).expect(200),
      http(app).get(`/api/patients/${patientId}/odontogram`).set(auth()).expect(200),
      http(app).get(`/api/patients/${patientId}/timeline`).set(auth()).expect(200),
      http(app).get(`/api/patients/${patientId}/notes`).set(auth()).expect(200),
      http(app).get(`/api/patients/${patientId}/vital-signs`).set(auth()).expect(200),
    ]);

  it('el odontograma completo (52 dientes) responde en menos de 1,5 s', async () => {
    await loadRecord(); // calentamiento
    const timings: number[] = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      const res = await http(app).get(`/api/patients/${patientId}/odontogram`).set(auth()).expect(200);
      timings.push(performance.now() - start);
      expect(res.body.findings).toHaveLength(52 * 5); // solo el estado vigente, no el historial
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95) - 1];
    console.info(`RNF-01 odontograma: mediana ${timings[7].toFixed(0)} ms · p95 ${p95.toFixed(0)} ms`);
    expect(p95).toBeLessThan(1500);
  });

  it('el expediente completo (todas las consultas en paralelo) carga en menos de 1,5 s', async () => {
    await loadRecord();
    const timings: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await loadRecord();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    console.info(`RNF-01 expediente: mediana ${timings[5].toFixed(0)} ms · máx ${timings.at(-1)!.toFixed(0)} ms`);
    expect(timings.at(-1)).toBeLessThan(1500);
  });
});
