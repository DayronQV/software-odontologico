import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, createUser, http, TestSession } from './helpers';
import { createProcedure } from './fixtures';

describe('Catálogo y administración (Fase 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;
  let dentist: TestSession;
  let receptionist: TestSession;
  let auditor: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
    dentist = await createSession(app, Role.ODONTOLOGO);
    receptionist = await createSession(app, Role.RECEPCIONISTA);
    auditor = await createSession(app, Role.AUDITOR);
  });
  afterAll(() => app.close());

  const asAdmin = () => bearer(admin.accessToken);
  const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();

  describe('consultorios y sillones', () => {
    it('crea un consultorio, le agrega sillones y los lista juntos', async () => {
      const name = `Consultorio ${rnd()}`;
      const office = await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name, address: 'Piso 3' }).expect(201);
      expect(office.body.chairs).toEqual([]);

      await http(app).post('/api/catalog/chairs').set(asAdmin()).send({ officeId: office.body.id, name: 'Sillón 1' }).expect(201);
      await http(app).post('/api/catalog/chairs').set(asAdmin()).send({ officeId: office.body.id, name: 'Sillón 2' }).expect(201);

      const list = await http(app).get('/api/catalog/offices').query({ q: name }).set(bearer(receptionist.accessToken)).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].chairs.map((c: { name: string }) => c.name)).toEqual(['Sillón 1', 'Sillón 2']);
    });

    it('rechaza nombres duplicados (consultorio y sillón dentro del mismo consultorio)', async () => {
      const name = `Duplicado ${rnd()}`;
      const office = await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name }).expect(201);
      await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name }).expect(409);

      const chair = { officeId: office.body.id, name: 'Sillón X' };
      await http(app).post('/api/catalog/chairs').set(asAdmin()).send(chair).expect(201);
      await http(app).post('/api/catalog/chairs').set(asAdmin()).send(chair).expect(409);
    });

    it('desactiva en lugar de borrar y no permite sillones en consultorios inactivos', async () => {
      const office = await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name: `Inactivo ${rnd()}` }).expect(201);
      const updated = await http(app).patch(`/api/catalog/offices/${office.body.id}`).set(asAdmin()).send({ active: false }).expect(200);
      expect(updated.body.active).toBe(false);
      await http(app).post('/api/catalog/chairs').set(asAdmin()).send({ officeId: office.body.id, name: 'Sillón 1' }).expect(409);
      await http(app).delete(`/api/catalog/offices/${office.body.id}`).set(asAdmin()).expect(404); // no existe DELETE
    });

    it('valida los datos y el consultorio inexistente', async () => {
      await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name: 'A' }).expect(400);
      await http(app).post('/api/catalog/chairs').set(asAdmin()).send({ officeId: 'no-uuid', name: 'S' }).expect(400);
      await http(app)
        .post('/api/catalog/chairs')
        .set(asAdmin())
        .send({ officeId: '00000000-0000-4000-8000-000000000000', name: 'S' })
        .expect(404);
    });

    it('solo el administrador modifica; los demás perfiles consultan', async () => {
      await http(app).post('/api/catalog/offices').set(bearer(receptionist.accessToken)).send({ name: 'Intruso' }).expect(403);
      await http(app).post('/api/catalog/chairs').set(bearer(dentist.accessToken)).send({}).expect(403);
      await http(app).get('/api/catalog/offices').set(bearer(dentist.accessToken)).expect(200);
    });
  });

  describe('procedimientos (catálogo médico)', () => {
    it('crea con código normalizado a mayúsculas y precios decimales', async () => {
      const code = `lim-${rnd().toLowerCase()}`;
      const res = await http(app)
        .post('/api/catalog/procedures')
        .set(asAdmin())
        .send({ code, name: 'Limpieza profunda', category: 'Preventiva', durationMinutes: 45, basePrice: 39.9, labCost: 2.5, requiresConsent: false })
        .expect(201);
      expect(res.body.code).toBe(code.toUpperCase());
      expect(res.body.basePrice).toBe(39.9);
      expect(res.body.labCost).toBe(2.5);
      expect(res.body.active).toBe(true);
    });

    it('valida código, duración y precios', async () => {
      const base = { name: 'Válido', category: 'Cat', durationMinutes: 30, basePrice: 10 };
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send({ ...base, code: '!!' }).expect(400);
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send({ ...base, code: 'OK-1', durationMinutes: 2 }).expect(400);
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send({ ...base, code: 'OK-2', basePrice: -5 }).expect(400);
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send({ ...base, code: 'OK-3', basePrice: 10.999 }).expect(400);
    });

    it('rechaza códigos repetidos', async () => {
      const code = `DUP-${rnd()}`;
      const body = { code, name: 'Procedimiento', category: 'Cat', durationMinutes: 30, basePrice: 10 };
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send(body).expect(201);
      await http(app).post('/api/catalog/procedures').set(asAdmin()).send(body).expect(409);
    });

    it('busca, filtra por categoría y estado, y pagina', async () => {
      const category = `Cat-${rnd()}`;
      for (let i = 0; i < 3; i++) await createProcedure(app, { category });
      const inactive = await createProcedure(app, { category });
      await http(app).patch(`/api/catalog/procedures/${inactive.id}`).set(asAdmin()).send({ active: false }).expect(200);

      const all = await http(app).get('/api/catalog/procedures').query({ category }).set(asAdmin()).expect(200);
      expect(all.body.total).toBe(4);

      const active = await http(app).get('/api/catalog/procedures').query({ category, active: 'true', pageSize: 2 }).set(asAdmin()).expect(200);
      expect(active.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(active.body.items).toHaveLength(2);

      const page2 = await http(app).get('/api/catalog/procedures').query({ category, active: 'true', pageSize: 2, page: 2 }).set(asAdmin()).expect(200);
      expect(page2.body.items).toHaveLength(1);

      const byCode = await http(app).get('/api/catalog/procedures').query({ q: inactive.code.toLowerCase() }).set(asAdmin()).expect(200);
      expect(byCode.body.items.map((p: { id: string }) => p.id)).toEqual([inactive.id]);
    });

    it('lista las categorías existentes y permite cambiar el precio', async () => {
      const category = `Cat-${rnd()}`;
      const procedure = await createProcedure(app, { category });
      const categories = await http(app).get('/api/catalog/procedures/categories').set(bearer(receptionist.accessToken)).expect(200);
      expect(categories.body).toContain(category);

      const updated = await http(app).patch(`/api/catalog/procedures/${procedure.id}`).set(asAdmin()).send({ basePrice: 99.5 }).expect(200);
      expect(updated.body.basePrice).toBe(99.5);
    });

    it('el odontólogo consulta el catálogo pero no lo modifica', async () => {
      await http(app).get('/api/catalog/procedures').set(bearer(dentist.accessToken)).expect(200);
      await http(app).post('/api/catalog/procedures').set(bearer(dentist.accessToken)).send({}).expect(403);
    });
  });

  describe('profesionales y horario laboral', () => {
    it('registra un odontólogo con su horario y lo lista con su nombre', async () => {
      const user = await createUser(app, Role.ODONTOLOGO);
      const res = await http(app)
        .post('/api/catalog/professionals')
        .set(asAdmin())
        .send({
          userId: user.id,
          kind: 'SPECIALIST',
          specialty: 'Endodoncia',
          licenseNumber: 'REG-123',
          schedule: [{ weekday: 1, startMinute: 480, endMinute: 720 }, { weekday: 1, startMinute: 840, endMinute: 1080 }],
        })
        .expect(201);
      expect(res.body.schedules).toHaveLength(2);
      expect(res.body.user.email).toBe(user.email);

      const list = await http(app).get('/api/catalog/professionals').query({ q: 'Endodoncia' }).set(bearer(receptionist.accessToken)).expect(200);
      expect(list.body.items.some((p: { id: string }) => p.id === res.body.id)).toBe(true);
    });

    it('solo usuarios con perfil Odontólogo, y una sola vez', async () => {
      const notDentist = await createUser(app, Role.RECEPCIONISTA);
      await http(app).post('/api/catalog/professionals').set(asAdmin()).send({ userId: notDentist.id, kind: 'GENERAL' }).expect(400);

      const user = await createUser(app, Role.ODONTOLOGO);
      await http(app).post('/api/catalog/professionals').set(asAdmin()).send({ userId: user.id, kind: 'GENERAL' }).expect(201);
      await http(app).post('/api/catalog/professionals').set(asAdmin()).send({ userId: user.id, kind: 'GENERAL' }).expect(409);
      await http(app)
        .post('/api/catalog/professionals')
        .set(asAdmin())
        .send({ userId: '00000000-0000-4000-8000-000000000000', kind: 'GENERAL' })
        .expect(404);
    });

    it('rechaza horarios incoherentes y permite reemplazarlo', async () => {
      const user = await createUser(app, Role.ODONTOLOGO);
      const professional = await http(app).post('/api/catalog/professionals').set(asAdmin()).send({ userId: user.id, kind: 'GENERAL' }).expect(201);
      const put = (slots: object[]) => http(app).put(`/api/catalog/professionals/${professional.body.id}/schedule`).set(asAdmin()).send({ slots });

      await put([{ weekday: 2, startMinute: 600, endMinute: 540 }]).expect(400);
      await put([{ weekday: 2, startMinute: 480, endMinute: 780 }, { weekday: 2, startMinute: 720, endMinute: 900 }]).expect(400);
      await put([{ weekday: 9, startMinute: 480, endMinute: 780 }]).expect(400);

      const ok = await put([{ weekday: 2, startMinute: 480, endMinute: 780 }, { weekday: 4, startMinute: 600, endMinute: 900 }]).expect(200);
      expect(ok.body.schedules.map((s: { weekday: number }) => s.weekday)).toEqual([2, 4]);

      const replaced = await put([{ weekday: 5, startMinute: 480, endMinute: 600 }]).expect(200);
      expect(replaced.body.schedules).toHaveLength(1);
    });

    it('el odontólogo consulta su propio perfil profesional', async () => {
      await http(app).get('/api/catalog/professionals/me').set(bearer(dentist.accessToken)).expect(404); // aún sin perfil
      await prisma.db.professional.create({ data: { userId: dentist.user.id, kind: 'GENERAL' } });
      const me = await http(app).get('/api/catalog/professionals/me').set(bearer(dentist.accessToken)).expect(200);
      expect(me.body.user.id).toBe(dentist.user.id);
      await http(app).get('/api/catalog/professionals/me').set(bearer(receptionist.accessToken)).expect(403);
    });
  });

  describe('seguros y convenios', () => {
    it('crea, busca, desactiva y rechaza duplicados', async () => {
      const name = `Aseguradora ${rnd()}`;
      const created = await http(app).post('/api/catalog/insurers').set(asAdmin()).send({ name }).expect(201);
      await http(app).post('/api/catalog/insurers').set(asAdmin()).send({ name }).expect(409);

      const found = await http(app).get('/api/catalog/insurers').query({ q: name.slice(0, 12), active: 'true' }).set(bearer(receptionist.accessToken)).expect(200);
      expect(found.body.items.map((i: { id: string }) => i.id)).toContain(created.body.id);

      await http(app).patch(`/api/catalog/insurers/${created.body.id}`).set(asAdmin()).send({ active: false }).expect(200);
      const active = await http(app).get('/api/catalog/insurers').query({ q: name, active: 'true' }).set(asAdmin()).expect(200);
      expect(active.body.total).toBe(0);
    });
  });

  describe('parámetros globales', () => {
    const settings = () => http(app).get('/api/catalog/settings').set(bearer(dentist.accessToken));

    it('todos los perfiles los consultan y traen los valores por defecto del SRS', async () => {
      const res = await settings().expect(200);
      expect(res.body).toMatchObject({ id: 1, reminderHours: [48, 24], opensAtMinute: 420, closesAtMinute: 1260 });
      await http(app).get('/api/catalog/settings').expect(401);
    });

    it('el administrador los modifica y quedan ordenados; el resto no puede', async () => {
      const before = (await settings().expect(200)).body;
      try {
        const res = await http(app)
          .patch('/api/catalog/settings')
          .set(asAdmin())
          .send({ reminderHours: [24, 72, 48], taxRatePercent: 15, maxDiscountPercent: 20 })
          .expect(200);
        expect(res.body.reminderHours).toEqual([72, 48, 24]);
        expect(res.body.taxRatePercent).toBe(15);
        await http(app).patch('/api/catalog/settings').set(bearer(receptionist.accessToken)).send({ taxRatePercent: 0 }).expect(403);
      } finally {
        await http(app)
          .patch('/api/catalog/settings')
          .set(asAdmin())
          .send({ reminderHours: before.reminderHours, taxRatePercent: before.taxRatePercent, maxDiscountPercent: before.maxDiscountPercent })
          .expect(200);
      }
    });

    it('valida horarios, zona horaria, moneda y recordatorios', async () => {
      const patch = (body: object) => http(app).patch('/api/catalog/settings').set(asAdmin()).send(body);
      await patch({ opensAtMinute: 1000, closesAtMinute: 900 }).expect(400);
      await patch({ timezone: 'Marte/Olympus' }).expect(400);
      await patch({ currency: 'dólar' }).expect(400);
      await patch({ reminderHours: [24, 24] }).expect(400);
      await patch({ reminderHours: [0] }).expect(400);
      await patch({ taxRatePercent: 120 }).expect(400);
    });
  });

  describe('reglas de alerta médica', () => {
    it('trae las reglas por defecto (penicilina, anticoagulado…) y las ve el personal clínico', async () => {
      const res = await http(app).get('/api/catalog/alert-rules').set(bearer(receptionist.accessToken)).expect(200);
      const labels = res.body.map((r: { label: string }) => r.label);
      expect(labels).toEqual(expect.arrayContaining(['Alergia a penicilina', 'Paciente anticoagulado']));
      await http(app).get('/api/catalog/alert-rules').set(bearer(auditor.accessToken)).expect(403);
    });

    it('el administrador crea y desactiva reglas; las de texto exigen palabra clave', async () => {
      await http(app).post('/api/catalog/alert-rules').set(asAdmin()).send({ label: 'Alergia a látex', kind: 'DRUG_ALLERGY' }).expect(400);
      const rule = await http(app)
        .post('/api/catalog/alert-rules')
        .set(asAdmin())
        .send({ label: `Alergia a látex ${rnd()}`, kind: 'DRUG_ALLERGY', keyword: 'latex', severity: 'CRITICAL' })
        .expect(201);
      const off = await http(app).patch(`/api/catalog/alert-rules/${rule.body.id}`).set(asAdmin()).send({ active: false }).expect(200);
      expect(off.body.active).toBe(false);
      await http(app).post('/api/catalog/alert-rules').set(bearer(receptionist.accessToken)).send({}).expect(403);
    });
  });

  it('los cambios de configuración quedan en el log de auditoría', async () => {
    const name = `Auditado ${rnd()}`;
    const office = await http(app).post('/api/catalog/offices').set(asAdmin()).send({ name }).expect(201);
    const log = await prisma.db.auditLog.findFirstOrThrow({
      where: { entity: 'Office', action: 'CREATE', entityId: office.body.id },
    });
    expect(log.userId).toBe(admin.user.id);
  });
});
