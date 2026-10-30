import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConsumptionService } from '../src/inventory/consumption.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createChairs, createPatient, createProcedure, createProfessional, postAppointment, slot } from './fixtures';
import { bearer, createSession, createTestApp, enrollSession, http, TestSession } from './helpers';

let counter = 0;
const code = () => `T${Date.now().toString(36).toUpperCase()}${counter++}`;

describe('Inventario por consultorio y profesional (RF-14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;
  let assistant: TestSession;
  let auditor: TestSession;
  let reception: TestSession;
  let dentist: TestSession;
  let officeId: string;
  let chairId: string;
  let professionalId: string;
  let officeLoc: string;
  let proLoc: string;
  let resin: { id: string };
  let anesthesia: { id: string };
  let procedureId: string;
  let patientId: string;
  let appointmentId: string;

  const api = (token: TestSession, method: 'get' | 'post' | 'put' | 'patch', url: string, body?: object) => {
    const req = http(app)[method](`/api${url}`).set(bearer(token.accessToken));
    return body ? req.send(body) : req;
  };
  const stockOf = async (itemId: string, locationId: string) => {
    const rows = (await api(assistant, 'get', `/inventory/stock?locationId=${locationId}`).expect(200)).body as Array<{ itemId: string; quantity: number }>;
    return rows.find((r) => r.itemId === itemId)?.quantity ?? 0;
  };
  const entry = (itemId: string, locationId: string, quantity: number, extra: object = {}) =>
    api(assistant, 'post', '/inventory/entries', { itemId, locationId, quantity, supplier: 'Proveedor', ...extra });
  const registerProcedure = () => api(dentist, 'post', `/patients/${patientId}/procedure-records`, { procedureId, appointmentId });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
    assistant = await createSession(app, Role.ASISTENTE);
    auditor = await createSession(app, Role.AUDITOR);
    reception = await createSession(app, Role.RECEPCIONISTA);

    const office = await createChairs(app, 1);
    officeId = office.officeId;
    chairId = office.chairs[0].id;
    const professional = await createProfessional(app);
    professionalId = professional.professionalId;
    dentist = await enrollSession(app, professional.user);

    const item = async (name: string, minStock = 0) =>
      (await api(admin, 'post', '/inventory/items', { code: code(), name, unit: 'g', unitCost: 2, minStock }).expect(201)).body;
    resin = await item('Resina de prueba', 5);
    anesthesia = await item('Anestesia de prueba');
    procedureId = (await createProcedure(app, { price: 100 })).id;
    await api(admin, 'put', `/inventory/recipes/${procedureId}`, {
      lines: [{ itemId: resin.id, quantity: 2 }, { itemId: anesthesia.id, quantity: 0.5 }],
    }).expect(200);

    const locations = (await api(assistant, 'get', '/inventory/locations').expect(200)).body as Array<{ id: string; officeId: string | null; professionalId: string | null }>;
    officeLoc = locations.find((l) => l.officeId === officeId)!.id;
    proLoc = locations.find((l) => l.professionalId === professionalId)!.id;

    patientId = (await createPatient(app, reception.accessToken)).id;
    const appointment = await postAppointment(app, reception.accessToken, { patientId, professionalId, chairId, procedureIds: [procedureId], ...slot(3, 10) }).expect(201);
    appointmentId = appointment.body.id;
  });
  afterAll(async () => {
    await api(admin, 'patch', '/catalog/settings', { stockPolicy: 'ALLOW_WITH_ALERT' });
    await app.close();
  });

  describe('insumos y existencias por ubicación', () => {
    it('el administrador mantiene el catálogo de insumos; el asistente no', async () => {
      await api(assistant, 'post', '/inventory/items', { code: code(), name: 'No', unit: 'g', unitCost: 1, minStock: 0 }).expect(403);
      await api(admin, 'post', '/inventory/items', { code: 'minusculas', name: 'Mal', unit: 'g', unitCost: 1, minStock: 0 }).expect(400);
      const updated = await api(admin, 'put', `/inventory/items/${resin.id}`, { code: code(), name: 'Resina de prueba', unit: 'g', unitCost: 2.5, minStock: 5 }).expect(200);
      expect(updated.body.unitCost).toBe(2.5);
    });

    it('cada consultorio y cada profesional tiene su propia ubicación de stock', async () => {
      expect(officeLoc).not.toBe(proLoc);
      await entry(resin.id, officeLoc, 10, { lotCode: 'L-1', expiresAt: '2027-01-31' }).expect(201);
      await entry(resin.id, proLoc, 3).expect(201);
      expect(await stockOf(resin.id, officeLoc)).toBe(10);
      expect(await stockOf(resin.id, proLoc)).toBe(3);
    });

    it('valida las entradas y los permisos del kardex', async () => {
      await entry(resin.id, officeLoc, 0).expect(400);
      await entry(resin.id, officeLoc, -2).expect(400);
      await api(auditor, 'post', '/inventory/entries', { itemId: resin.id, locationId: officeLoc, quantity: 1 }).expect(403);
      await api(reception, 'get', '/inventory/stock').expect(403);
    });

    it('el ajuste exige motivo y nunca deja el stock en negativo', async () => {
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: -1 }).expect(400);
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: -1, reason: 'abc' }).expect(400);
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: -99, reason: 'Merma por caducidad' }).expect(409);
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: -1, reason: 'Se cayó el frasco' }).expect(201);
      expect(await stockOf(resin.id, proLoc)).toBe(2);
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: 1, reason: 'Corrección del conteo' }).expect(201);
    });

    it('traslada stock entre ubicaciones con dos movimientos enlazados', async () => {
      await api(assistant, 'post', '/inventory/transfers', { itemId: resin.id, fromLocationId: proLoc, toLocationId: proLoc, quantity: 1 }).expect(400);
      await api(assistant, 'post', '/inventory/transfers', { itemId: resin.id, fromLocationId: proLoc, toLocationId: officeLoc, quantity: 50 }).expect(409);
      const moved = await api(assistant, 'post', '/inventory/transfers', { itemId: resin.id, fromLocationId: officeLoc, toLocationId: proLoc, quantity: 2, reason: 'Reposición del profesional' }).expect(201);
      expect(moved.body.out.quantity).toBe(-2);
      expect(await stockOf(resin.id, officeLoc)).toBe(8);
      expect(await stockOf(resin.id, proLoc)).toBe(5);
      const rows = await prisma.db.stockMovement.findMany({ where: { transferId: moved.body.transferId } });
      expect(rows.map((r) => r.type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    });

    it('el kardex lista los movimientos y es inmutable (API y SQL)', async () => {
      const kardex = await api(auditor, 'get', `/inventory/movements?itemId=${resin.id}`).expect(200);
      expect(kardex.body.total).toBeGreaterThanOrEqual(5);
      expect(kardex.body.items[0]).toMatchObject({ item: { name: 'Resina de prueba' }, by: expect.any(String) });
      const movement = await prisma.db.stockMovement.findFirstOrThrow({ where: { itemId: resin.id } });
      await expect(prisma.db.$executeRaw`UPDATE "StockMovement" SET "quantity" = 999 WHERE "id" = ${movement.id}`).rejects.toThrow(/no se pueden modificar/);
      await expect(prisma.db.$executeRaw`DELETE FROM "StockMovement" WHERE "id" = ${movement.id}`).rejects.toThrow(/no se pueden eliminar/);
      await expect(prisma.db.$executeRawUnsafe('TRUNCATE "StockMovement" CASCADE')).rejects.toThrow(/vaciar/);
      await api(admin, 'put', `/inventory/movements/${movement.id}`, {}).expect(404);
    });
  });

  describe('descargo automático al completar un procedimiento (RF-14)', () => {
    let recordId: string;

    it('descuenta según la receta: primero del profesional y luego del consultorio', async () => {
      // profesional: 5 de resina (receta pide 2) y 0 de anestesia; consultorio: 8 de resina
      await entry(anesthesia.id, officeLoc, 4).expect(201);
      const res = await registerProcedure().expect(201);
      recordId = res.body.id;
      expect(await stockOf(resin.id, proLoc)).toBe(3);
      expect(await stockOf(resin.id, officeLoc)).toBe(8);
      expect(await stockOf(anesthesia.id, officeLoc)).toBe(3.5);
      const history = await api(dentist, 'get', `/inventory/consumption/${recordId}`).expect(200);
      expect(history.body).toHaveLength(2);
      expect(history.body.every((m: { type: string }) => m.type === 'CONSUMPTION')).toBe(true);
    });

    it('si falta stock en el profesional, completa con el del consultorio', async () => {
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: proLoc, quantity: -2, reason: 'Se dejó 1 en el sillón' }).expect(201);
      await registerProcedure().expect(201); // pide 2: 1 del profesional + 1 del consultorio
      expect(await stockOf(resin.id, proLoc)).toBe(0);
      expect(await stockOf(resin.id, officeLoc)).toBe(7);
    });

    it('es idempotente: un mismo procedimiento no se descuenta dos veces', async () => {
      const before = await prisma.db.stockMovement.count({ where: { procedureRecordId: recordId } });
      const record = await prisma.db.procedureRecord.findUniqueOrThrow({ where: { id: recordId } });
      const moves = await prisma.db.$transaction((tx) =>
        app.get(ConsumptionService).consume(tx, { id: record.id, procedureId: record.procedureId, performedById: record.performedById, appointmentId: record.appointmentId }),
      );
      expect(moves).toBe(0);
      expect(await prisma.db.stockMovement.count({ where: { procedureRecordId: recordId } })).toBe(before);
      // y la base lo impide aunque se intente a mano
      const first = await prisma.db.stockMovement.findFirstOrThrow({ where: { procedureRecordId: recordId, type: 'CONSUMPTION' } });
      await expect(
        prisma.db.stockMovement.create({ data: { itemId: first.itemId, locationId: first.locationId, type: 'CONSUMPTION', quantity: -1, unitCost: 1, procedureRecordId: recordId, createdById: first.createdById } }),
      ).rejects.toThrow();
    });

    it('política «bloquear»: sin stock suficiente no se registra el procedimiento ni se descuenta nada (atomicidad)', async () => {
      await api(admin, 'patch', '/catalog/settings', { stockPolicy: 'BLOCK' }).expect(200);
      await api(assistant, 'post', '/inventory/adjustments', { itemId: resin.id, locationId: officeLoc, quantity: -6.5, reason: 'Dejar el stock casi vacío' }).expect(201); // quedan 0.5
      const records = await prisma.db.procedureRecord.count({ where: { patientId } });
      const moves = await prisma.db.stockMovement.count();
      const res = await registerProcedure().expect(409);
      expect(res.body.message).toMatch(/Stock insuficiente de «Resina de prueba»/);
      expect(await prisma.db.procedureRecord.count({ where: { patientId } })).toBe(records);
      expect(await prisma.db.stockMovement.count()).toBe(moves);
      expect(await stockOf(anesthesia.id, officeLoc)).toBe(3);
    });

    it('política «permitir con alerta»: se registra, queda en negativo y se anota la excepción', async () => {
      await api(admin, 'patch', '/catalog/settings', { stockPolicy: 'ALLOW_WITH_ALERT' }).expect(200);
      const res = await registerProcedure().expect(201);
      expect(await stockOf(resin.id, officeLoc)).toBe(-1.5);
      const alerts = (await api(auditor, 'get', '/inventory/alerts').expect(200)).body;
      expect(alerts.exceptions[0]).toMatchObject({ item: 'Resina de prueba', missing: 1.5, procedureRecordId: res.body.id });
      expect(alerts.low.some((l: { itemId: string }) => l.itemId === resin.id)).toBe(true);
    });

    it('revierte el descargo sin borrar el original y solo una vez', async () => {
      const before = await stockOf(anesthesia.id, officeLoc);
      await api(assistant, 'post', `/inventory/consumption/${recordId}/reverse`, { reason: 'Procedimiento mal registrado' }).expect(403);
      await api(dentist, 'post', `/inventory/consumption/${recordId}/reverse`, { reason: 'x' }).expect(400);
      const reversed = await api(dentist, 'post', `/inventory/consumption/${recordId}/reverse`, { reason: 'Procedimiento mal registrado' }).expect(200);
      expect(reversed.body.reversed).toBe(2);
      expect(await stockOf(anesthesia.id, officeLoc)).toBe(before + 0.5);
      await api(dentist, 'post', `/inventory/consumption/${recordId}/reverse`, { reason: 'Otra vez' }).expect(409);
      expect(await prisma.db.stockMovement.count({ where: { procedureRecordId: recordId, type: 'CONSUMPTION' } })).toBe(2); // el original sigue
      expect(await prisma.db.stockMovement.count({ where: { procedureRecordId: recordId, type: 'REVERSAL' } })).toBe(2);
    });

    it('ajusta el consumo real cuando difiere de la receta, con motivo', async () => {
      const second = await registerProcedure().expect(201); // la receta descuenta 0.5 de anestesia
      const before = await stockOf(anesthesia.id, officeLoc);
      await api(dentist, 'post', `/inventory/consumption/${second.body.id}/adjust`, { itemId: anesthesia.id, actualQuantity: 0.25, reason: 'Solo se usó medio carpule' }).expect(201);
      expect(await stockOf(anesthesia.id, officeLoc)).toBe(before + 0.25);
      await api(dentist, 'post', `/inventory/consumption/${second.body.id}/adjust`, { itemId: anesthesia.id, actualQuantity: 0.25, reason: 'Repetido' }).expect(409);
      await api(dentist, 'post', `/inventory/consumption/${second.body.id}/adjust`, { itemId: anesthesia.id, actualQuantity: 1, reason: 'abc' }).expect(400);
    });

    it('un procedimiento sin receta no descuenta nada', async () => {
      const bare = await createProcedure(app, { price: 10 });
      const before = await prisma.db.stockMovement.count();
      await api(dentist, 'post', `/patients/${patientId}/procedure-records`, { procedureId: bare.id, appointmentId }).expect(201);
      expect(await prisma.db.stockMovement.count()).toBe(before);
    });
  });

  describe('alertas, preparación de insumos y conteo físico', () => {
    it('alerta de vencimiento próximo (plazo configurable) y de stock mínimo', async () => {
      const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      await entry(anesthesia.id, officeLoc, 2, { lotCode: 'LOTE-VENCE', expiresAt: soon }).expect(201);
      const alerts = (await api(assistant, 'get', '/inventory/alerts').expect(200)).body;
      const lot = alerts.expiring.find((e: { lotCode: string }) => e.lotCode === 'LOTE-VENCE');
      expect(lot).toMatchObject({ item: 'Anestesia de prueba', state: 'EXPIRING' });
      await api(admin, 'patch', '/catalog/settings', { expiryAlertDays: 5 }).expect(200);
      const strict = (await api(assistant, 'get', '/inventory/alerts').expect(200)).body;
      expect(strict.expiring.some((e: { lotCode: string }) => e.lotCode === 'LOTE-VENCE')).toBe(false);
      await api(admin, 'patch', '/catalog/settings', { expiryAlertDays: 30 }).expect(200);
    });

    it('el asistente prepara los insumos de la cita a partir de las recetas', async () => {
      const suggestion = (await api(assistant, 'get', `/inventory/supply/suggest/${appointmentId}`).expect(200)).body;
      expect(suggestion).toEqual(expect.arrayContaining([{ itemId: resin.id, quantity: 2 }, { itemId: anesthesia.id, quantity: 0.5 }]));
      const created = await api(dentist, 'post', '/inventory/supply', { appointmentId }).expect(201);
      expect(created.body.status).toBe('REQUESTED');
      await api(assistant, 'post', '/inventory/supply', { appointmentId }).expect(409); // ya hay una
      await api(dentist, 'post', `/inventory/supply/${created.body.id}/prepare`).expect(403); // solo el asistente prepara
      const prepared = await api(assistant, 'post', `/inventory/supply/${created.body.id}/prepare`).expect(200);
      expect(prepared.body.status).toBe('PREPARED');
      await api(assistant, 'post', `/inventory/supply/${created.body.id}/prepare`).expect(409);

      const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const list = (await api(assistant, 'get', `/inventory/supply?date=${day}`).expect(200)).body;
      const row = list.find((r: { appointmentId: string }) => r.appointmentId === appointmentId);
      expect(row.request.status).toBe('PREPARED');
      expect(row.request.lines).toHaveLength(2);
      const stock = (await api(assistant, 'get', '/inventory/stock').expect(200)).body as Array<{ itemId: string; reserved: number }>;
      expect(stock.find((r) => r.itemId === resin.id)?.reserved).toBe(2); // reservado para la cita
      await api(reception, 'get', '/inventory/supply').expect(403);
    });

    it('toma de inventario físico: se cuenta y solo el auditor concilia, generando ajustes', async () => {
      const count = (await api(assistant, 'post', '/inventory/counts', { locationId: proLoc }).expect(201)).body;
      await api(assistant, 'post', '/inventory/counts', { locationId: proLoc }).expect(409);
      await api(auditor, 'post', `/inventory/counts/${count.id}/reconcile`).expect(400); // sin conteos todavía

      await api(assistant, 'put', `/inventory/counts/${count.id}`, { lines: [{ itemId: resin.id, countedQty: 4 }] }).expect(200);
      await api(assistant, 'put', `/inventory/counts/${count.id}`, { lines: [{ itemId: '11111111-1111-4111-8111-111111111111', countedQty: 1 }] }).expect(400);
      await api(assistant, 'post', `/inventory/counts/${count.id}/reconcile`).expect(403);

      const done = await api(auditor, 'post', `/inventory/counts/${count.id}/reconcile`).expect(200);
      expect(done.body).toMatchObject({ status: 'RECONCILED', adjustments: 1 });
      expect(await stockOf(resin.id, proLoc)).toBe(4);
      const adjustment = await prisma.db.stockMovement.findFirstOrThrow({ where: { itemId: resin.id, locationId: proLoc, type: 'ADJUSTMENT' }, orderBy: { createdAt: 'desc' } });
      expect(adjustment.reason).toContain('Conciliación de inventario físico');
      await api(auditor, 'post', `/inventory/counts/${count.id}/reconcile`).expect(409);
      await api(assistant, 'put', `/inventory/counts/${count.id}`, { lines: [{ itemId: resin.id, countedQty: 1 }] }).expect(409);
    });
  });

  describe('permisos', () => {
    it('recepción no accede al inventario; el odontólogo solo a las recetas; el auditor lee', async () => {
      for (const path of ['/inventory/items', '/inventory/stock', '/inventory/alerts', '/inventory/movements', '/inventory/recipes', '/inventory/counts']) {
        await api(reception, 'get', path).expect(403);
        await api(auditor, 'get', path).expect(200);
      }
      await api(dentist, 'get', '/inventory/recipes').expect(200);
      await api(dentist, 'get', '/inventory/stock').expect(403);
      await api(dentist, 'put', `/inventory/recipes/${procedureId}`, { lines: [] }).expect(403);
    });

    it('los cambios de inventario quedan auditados', async () => {
      const actions = (await prisma.db.auditLog.findMany({ where: { entity: 'Inventory' }, select: { action: true } })).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['CREATE', 'READ', 'UPDATE']));
    });

    it('la receta valida insumos repetidos o inexistentes', async () => {
      await api(admin, 'put', `/inventory/recipes/${procedureId}`, { lines: [{ itemId: resin.id, quantity: 1 }, { itemId: resin.id, quantity: 2 }] }).expect(400);
      await api(admin, 'put', `/inventory/recipes/${procedureId}`, { lines: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] }).expect(400);
    });
  });
});
