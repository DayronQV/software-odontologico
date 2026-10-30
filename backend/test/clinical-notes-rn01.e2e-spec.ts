import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext, createConsentProcedure } from './clinical-fixtures';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

const HOUR = 3_600_000;
const soep = (overrides: Record<string, unknown> = {}) => ({
  subjective: 'Dolor al masticar',
  objective: 'Caries profunda en 46',
  assessment: 'Pulpitis irreversible',
  plan: 'Endodoncia',
  ...overrides,
});

describe('Evolución SOEP: firma, bloqueo y adendas (RF-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;
  let otherDentist: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
    otherDentist = await createSession(app, Role.ODONTOLOGO);
  });
  afterAll(async () => {
    await http(app).patch('/api/catalog/settings').set(bearer(ctx.admin.accessToken)).send({ noteLockHours: 24 });
    await app.close();
  });

  const notes = () => `/api/patients/${ctx.patient.id}/notes`;
  const dentist = () => bearer(ctx.dentist.accessToken);
  const createNote = (token = ctx.dentist.accessToken, body = soep()) =>
    http(app).post(notes()).set(bearer(token)).send(body);

  /** Simula que pasaron `hours` horas desde que se escribió la nota (desactiva el trigger solo para el retroceso). */
  async function ageNote(noteId: string, hours: number) {
    await prisma.db.$executeRawUnsafe('ALTER TABLE "EvolutionNote" DISABLE TRIGGER evolution_note_update_guard');
    try {
      await prisma.db.$executeRaw`UPDATE "EvolutionNote"
        SET "createdAt" = "createdAt" - make_interval(hours => ${hours}::int),
            "lockAt" = "lockAt" - make_interval(hours => ${hours}::int)
        WHERE "id" = ${noteId}`;
    } finally {
      await prisma.db.$executeRawUnsafe('ALTER TABLE "EvolutionNote" ENABLE TRIGGER evolution_note_update_guard');
    }
  }

  describe('notas y plazo de edición', () => {
    it('el odontólogo crea una nota SOEP y el plazo por defecto es de 24 h', async () => {
      const res = await createNote().expect(201);
      expect(res.body).toMatchObject({ kind: 'SOEP', signed: false, locked: false, author: expect.any(String) });
      const span = new Date(res.body.lockAt).getTime() - new Date(res.body.createdAt).getTime();
      expect(Math.abs(span - 24 * HOUR)).toBeLessThan(2_000);
    });

    it('el asistente escribe notas clínicas propias, marcadas como tales', async () => {
      const res = await createNote(ctx.assistant.accessToken).expect(201);
      expect(res.body.kind).toBe('ASSISTANT');
      const list = await http(app).get(notes()).set(dentist()).expect(200);
      expect(list.body.some((n: { kind: string }) => n.kind === 'ASSISTANT')).toBe(true);
    });

    it('el plazo es configurable (parámetro global) y se aplica a las notas nuevas', async () => {
      await http(app).patch('/api/catalog/settings').set(bearer(ctx.admin.accessToken)).send({ noteLockHours: 48 }).expect(200);
      const res = await createNote().expect(201);
      const span = new Date(res.body.lockAt).getTime() - new Date(res.body.createdAt).getTime();
      expect(Math.abs(span - 48 * HOUR)).toBeLessThan(2_000);
      await http(app).patch('/api/catalog/settings').set(bearer(ctx.admin.accessToken)).send({ noteLockHours: 24 }).expect(200);
    });

    it('solo el autor edita su nota, y dentro del plazo', async () => {
      const note = (await createNote().expect(201)).body;
      const patch = (token: string, body: Record<string, unknown>) =>
        http(app).patch(`/api/notes/${note.id}`).set(bearer(token)).send(body);
      const edited = await patch(ctx.dentist.accessToken, { plan: 'Endodoncia y corona' }).expect(200);
      expect(edited.body.plan).toBe('Endodoncia y corona');
      await patch(otherDentist.accessToken, { plan: 'x' }).expect(403);
      await patch(ctx.assistant.accessToken, { plan: 'x' }).expect(403);
    });
  });

  describe('bloqueo a las 24 h', () => {
    it('tras el plazo la nota queda bloqueada en la API y en la base de datos', async () => {
      const note = (await createNote().expect(201)).body;
      await ageNote(note.id, 25); // pasaron 25 horas

      const list = await http(app).get(notes()).set(dentist()).expect(200);
      expect(list.body.find((n: { id: string }) => n.id === note.id)).toMatchObject({ locked: true });

      await http(app).patch(`/api/notes/${note.id}`).set(dentist()).send({ plan: 'cambio tardío' }).expect(409);

      // el trigger SQL lo refuerza aunque se salte la aplicación
      await expect(
        prisma.db.$executeRaw`UPDATE "EvolutionNote" SET "plan" = 'manipulado' WHERE "id" = ${note.id}`,
      ).rejects.toThrow(/bloqueada/);
      await expect(
        prisma.db.$executeRaw`UPDATE "EvolutionNote" SET "lockAt" = now() + interval '1 day' WHERE "id" = ${note.id}`,
      ).rejects.toThrow(/plazo/);
      await expect(prisma.db.$executeRaw`DELETE FROM "EvolutionNote" WHERE "id" = ${note.id}`).rejects.toThrow(
        /no se pueden eliminar/,
      );
    });

    it('con plazo 0 la nota nace bloqueada', async () => {
      await http(app).patch('/api/catalog/settings').set(bearer(ctx.admin.accessToken)).send({ noteLockHours: 0 }).expect(200);
      const note = (await createNote().expect(201)).body;
      expect(note.locked).toBe(true);
      await http(app).patch(`/api/notes/${note.id}`).set(dentist()).send({ plan: 'x' }).expect(409);
      await http(app).patch('/api/catalog/settings').set(bearer(ctx.admin.accessToken)).send({ noteLockHours: 24 }).expect(200);
    });
  });

  describe('firma digital del profesional', () => {
    it('exige reautenticar con la contraseña; guarda sello de tiempo y hash SHA-256', async () => {
      const note = (await createNote().expect(201)).body;
      const sign = (password: string, token = ctx.dentist.accessToken) =>
        http(app).post(`/api/notes/${note.id}/sign`).set(bearer(token)).send({ password });

      await sign('contraseña-equivocada').expect(403);
      const signed = await sign(ctx.dentist.user.password).expect(200);
      expect(signed.body).toMatchObject({ signed: true, signedBy: expect.any(String) });
      expect(signed.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(new Date(signed.body.signedAt).getTime()).toBeLessThanOrEqual(Date.now());
      await sign(ctx.dentist.user.password).expect(409); // ya firmada
    });

    it('verifica la integridad y detecta una manipulación del contenido', async () => {
      const note = (await createNote().expect(201)).body;
      await http(app).post(`/api/notes/${note.id}/sign`).set(dentist()).send({ password: ctx.dentist.user.password }).expect(200);
      const verify = () => http(app).get(`${notes()}/${note.id}/verify`).set(dentist());
      expect((await verify().expect(200)).body).toMatchObject({ signed: true, valid: true });

      // alteración directa de la base de datos (con el trigger de la nota desactivado)
      await prisma.db.$executeRawUnsafe('ALTER TABLE "EvolutionNote" DISABLE TRIGGER evolution_note_update_guard');
      try {
        const forged = prisma.db.$executeRaw`UPDATE "EvolutionNote" SET "plan" = 'texto alterado' WHERE "id" = ${note.id}`;
        await forged;
      } finally {
        await prisma.db.$executeRawUnsafe('ALTER TABLE "EvolutionNote" ENABLE TRIGGER evolution_note_update_guard');
      }
      expect((await verify().expect(200)).body).toMatchObject({ signed: true, valid: false });
    });

    it('editar una nota firmada (dentro del plazo) anula la firma', async () => {
      const note = (await createNote().expect(201)).body;
      await http(app).post(`/api/notes/${note.id}/sign`).set(dentist()).send({ password: ctx.dentist.user.password }).expect(200);
      const edited = await http(app).patch(`/api/notes/${note.id}`).set(dentist()).send({ plan: 'Plan nuevo' }).expect(200);
      expect(edited.body).toMatchObject({ signed: false, contentHash: null });
    });

    it('el asistente no firma ni las notas del odontólogo ni las propias; otro odontólogo tampoco', async () => {
      const note = (await createNote().expect(201)).body;
      await http(app).post(`/api/notes/${note.id}/sign`).set(bearer(ctx.assistant.accessToken)).send({ password: ctx.assistant.user.password }).expect(403);
      await http(app).post(`/api/notes/${note.id}/sign`).set(bearer(otherDentist.accessToken)).send({ password: otherDentist.user.password }).expect(403);
    });
  });

  describe('adenda firmada: única vía para corregir una nota bloqueada', () => {
    it('no se admite adenda mientras la nota aún es editable', async () => {
      const note = (await createNote().expect(201)).body;
      await http(app)
        .post(`/api/notes/${note.id}/addenda`)
        .set(dentist())
        .send({ content: 'Corrección pendiente', password: ctx.dentist.user.password })
        .expect(409);
    });

    it('con la nota bloqueada, el autor la corrige con una adenda firmada (con reautenticación)', async () => {
      const note = (await createNote().expect(201)).body;
      await ageNote(note.id, 30);
      const post = (token: string, body: Record<string, unknown>) =>
        http(app).post(`/api/notes/${note.id}/addenda`).set(bearer(token)).send(body);

      await post(ctx.dentist.accessToken, { content: 'Se omitió la alergia a látex', password: 'incorrecta' }).expect(403);
      await post(otherDentist.accessToken, { content: 'Intento ajeno de corrección', password: otherDentist.user.password }).expect(403);
      await post(ctx.dentist.accessToken, { content: 'ok', password: ctx.dentist.user.password }).expect(400); // demasiado corta

      const addendum = await post(ctx.dentist.accessToken, {
        content: 'Se omitió la alergia a látex del paciente',
        password: ctx.dentist.user.password,
      }).expect(201);
      expect(addendum.body.contentHash).toMatch(/^[0-9a-f]{64}$/);

      const list = await http(app).get(notes()).set(dentist()).expect(200);
      const shown = list.body.find((n: { id: string }) => n.id === note.id);
      expect(shown.addenda).toHaveLength(1);
      expect(shown.addenda[0].content).toBe('Se omitió la alergia a látex del paciente');
      // la nota original no cambió
      expect(shown.plan).toBe('Endodoncia');
    });

    it('una adenda no se puede editar ni borrar (trigger SQL)', async () => {
      const addendum = await prisma.db.clinicalAddendum.findFirstOrThrow({ where: { patientId: ctx.patient.id } });
      await expect(
        prisma.db.$executeRaw`UPDATE "ClinicalAddendum" SET "content" = 'reescrita' WHERE "id" = ${addendum.id}`,
      ).rejects.toThrow(/no se pueden modificar/);
      await expect(
        prisma.db.$executeRaw`DELETE FROM "ClinicalAddendum" WHERE "id" = ${addendum.id}`,
      ).rejects.toThrow(/no se pueden eliminar/);
    });
  });

  describe('permisos y auditoría', () => {
    it('recepción y administrador no acceden al contenido clínico', async () => {
      for (const token of [ctx.reception.accessToken, ctx.admin.accessToken]) {
        await http(app).get(notes()).set(bearer(token)).expect(403);
        await http(app).post(notes()).set(bearer(token)).send(soep()).expect(403);
      }
    });

    it('lecturas y escrituras de notas quedan auditadas sin copiar el texto clínico', async () => {
      await http(app).get(notes()).set(dentist()).expect(200);
      const created = await createNote().expect(201);
      const logs = await prisma.db.auditLog.findMany({
        where: { entity: 'EvolutionNote', userId: ctx.dentist.user.id },
        orderBy: { id: 'desc' },
        take: 5,
      });
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['READ', 'CREATE']));
      const serialized = JSON.stringify(logs, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
      expect(serialized).not.toContain('Dolor al masticar');
      expect(serialized).not.toContain('Pulpitis irreversible');
      expect(created.body.id).toBeTruthy();
    });

    it('el texto clínico se guarda cifrado en la base de datos', async () => {
      const [row] = await prisma.db.$queryRaw<Array<{ subjective: string }>>`
        SELECT "subjective" FROM "EvolutionNote" WHERE "patientId" = ${ctx.patient.id} LIMIT 1`;
      expect(row.subjective.startsWith('enc:v1:')).toBe(true);
    });
  });
});

describe('RN-01: procedimientos realizados (no se borran; solo adenda firmada)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;
  let otherDentist: TestSession;
  let recordId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
    otherDentist = await createSession(app, Role.ODONTOLOGO);
  });
  afterAll(() => app.close());

  const records = () => `/api/patients/${ctx.patient.id}/procedure-records`;

  it('el odontólogo registra un procedimiento realizado; el asistente y recepción no', async () => {
    const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: false });
    const body = { procedureId: procedure.id, toothCode: 46, surface: 'OCCLUSAL', notes: 'Sin complicaciones' };
    await http(app).post(records()).set(bearer(ctx.assistant.accessToken)).send(body).expect(403);
    await http(app).post(records()).set(bearer(ctx.reception.accessToken)).send(body).expect(403);

    const res = await http(app).post(records()).set(bearer(ctx.dentist.accessToken)).send(body).expect(201);
    recordId = res.body.id;
    expect(res.body).toMatchObject({ toothCode: 46, performedBy: expect.any(String), addenda: [] });
  });

  it('valida el diente y la superficie', async () => {
    const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: false });
    const post = (body: Record<string, unknown>) =>
      http(app).post(records()).set(bearer(ctx.dentist.accessToken)).send({ procedureId: procedure.id, ...body });
    await post({ toothCode: 19 }).expect(400);
    await post({ surface: 'MESIAL' }).expect(400); // superficie sin diente
  });

  it('NO existe forma de modificar ni borrar un procedimiento realizado por la API', async () => {
    const dentist = bearer(ctx.dentist.accessToken);
    for (const token of [dentist, bearer(ctx.admin.accessToken)]) {
      await http(app).delete(`${records()}/${recordId}`).set(token).expect(404);
      await http(app).delete(`/api/procedure-records/${recordId}`).set(token).expect(404);
      await http(app).put(`${records()}/${recordId}`).set(token).send({ notes: 'x' }).expect(404);
      await http(app).patch(`${records()}/${recordId}`).set(token).send({ notes: 'x' }).expect(404);
    }
    expect(await prisma.db.procedureRecord.count({ where: { id: recordId } })).toBe(1);
  });

  it('NO existe forma de modificarlo ni borrarlo por SQL directo (trigger)', async () => {
    await expect(prisma.db.$executeRaw`DELETE FROM "ProcedureRecord" WHERE "id" = ${recordId}`).rejects.toThrow(/adenda firmada/);
    await expect(
      prisma.db.$executeRaw`UPDATE "ProcedureRecord" SET "notes" = 'alterado' WHERE "id" = ${recordId}`,
    ).rejects.toThrow(/adenda firmada/);
    await expect(prisma.db.$executeRaw`DELETE FROM "ProcedureRecord"`).rejects.toThrow();
    await expect(prisma.db.$executeRawUnsafe('TRUNCATE "ProcedureRecord" CASCADE')).rejects.toThrow(/vaciar/);
  });

  it('la corrección se hace con una adenda firmada por el profesional responsable', async () => {
    const add = (token: string, body: Record<string, unknown>) =>
      http(app).post(`/api/procedure-records/${recordId}/addenda`).set(bearer(token)).send(body);

    await add(otherDentist.accessToken, { content: 'Corrección de otro profesional', password: otherDentist.user.password }).expect(403);
    await add(ctx.assistant.accessToken, { content: 'Corrección del asistente', password: ctx.assistant.user.password }).expect(403);
    await add(ctx.dentist.accessToken, { content: 'Era el diente 47, no el 46', password: 'mal' }).expect(403);

    const addendum = await add(ctx.dentist.accessToken, {
      content: 'Era el diente 47, no el 46',
      password: ctx.dentist.user.password,
    }).expect(201);
    expect(addendum.body).toMatchObject({ procedureRecordId: recordId, content: 'Era el diente 47, no el 46' });

    const list = await http(app).get(records()).set(bearer(ctx.dentist.accessToken)).expect(200);
    expect(list.body[0].addenda).toHaveLength(1);
    expect(list.body[0].toothCode).toBe(46); // el registro original se conserva intacto
  });
});
