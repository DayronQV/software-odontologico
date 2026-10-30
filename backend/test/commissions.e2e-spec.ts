import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createChairs, createPatient, createProcedure, createProfessional, postAppointment, slot } from './fixtures';
import { bearer, createSession, createTestApp, enrollSession, http, TestSession } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Comisiones y liquidación de honorarios (RF-13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;
  let auditor: TestSession;
  let reception: TestSession;
  let dentist: TestSession;
  let otherDentist: TestSession;
  let professionalId: string;
  let otherProfessionalId: string;
  let chairId: string;
  let p1: { id: string }; // 100 + laboratorio 20 + materiales 10 → comisión neta
  let p2: { id: string }; // 200 → porcentaje
  let p3: { id: string }; // 50 → monto fijo
  let slotDay = 3;

  const api = (who: TestSession, method: 'get' | 'post' | 'put' | 'delete', url: string, body?: object) => {
    const req = http(app)[method](`/api${url}`).set(bearer(who.accessToken));
    return body ? req.send(body) : req;
  };
  const rule = (body: object) =>
    api(admin, 'post', '/commissions/rules', { professionalId, validFrom: '2026-01-01', ...body });

  /** Cobra una factura de 3 líneas (P1 + P2 + 2 × P3) atribuida al profesional por medio de su cita. */
  async function charge() {
    const patient = await createPatient(app, reception.accessToken);
    const appointment = await postAppointment(app, reception.accessToken, { patientId: patient.id, professionalId, chairId, procedureIds: [p1.id], ...slot(slotDay++, 9) }).expect(201);
    const invoice = await api(reception, 'post', '/billing/invoices', {
      patientId: patient.id,
      appointmentId: appointment.body.id,
      lines: [{ procedureId: p1.id, quantity: 1 }, { procedureId: p2.id, quantity: 1 }, { procedureId: p3.id, quantity: 2 }],
      payments: [{ method: 'CASH', amount: 448 }], // 400 + 12 % de impuesto
    }).expect(201);
    return invoice.body.id as string;
  }
  const entriesOf = (invoiceId: string) => prisma.db.commissionEntry.findMany({ where: { invoiceId }, orderBy: [{ kind: 'asc' }, { amount: 'asc' }] });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
    auditor = await createSession(app, Role.AUDITOR);
    reception = await createSession(app, Role.RECEPCIONISTA);
    await api(reception, 'post', '/billing/cash-sessions/open', { openingFloat: 0 }).expect(201);
    await api(admin, 'post', '/billing/cash-sessions/open', { openingFloat: 1000 }).expect(201); // el efectivo devuelto al anular sale de su caja

    const main = await createProfessional(app);
    professionalId = main.professionalId;
    dentist = await enrollSession(app, main.user);
    const other = await createProfessional(app);
    otherProfessionalId = other.professionalId;
    otherDentist = await enrollSession(app, other.user);
    chairId = (await createChairs(app, 1)).chairs[0].id;

    p1 = await createProcedure(app, { price: 100 });
    await prisma.db.procedure.update({ where: { id: p1.id }, data: { labCost: 20 } });
    p2 = await createProcedure(app, { price: 200 });
    p3 = await createProcedure(app, { price: 50 });
    const item = await prisma.db.inventoryItem.create({ data: { code: `C${Date.now().toString(36)}`.toUpperCase(), name: 'Material de prueba', unit: 'g', unitCost: 2 } });
    await prisma.db.consumptionRecipe.create({ data: { procedureId: p1.id, itemId: item.id, quantity: 5 } }); // 10,00 de materiales

    await rule({ mode: 'PERCENT', value: 40 }).expect(201); // general
    await rule({ procedureId: p1.id, mode: 'PERCENT_NET_OF_COSTS', value: 50, priority: 1 }).expect(201);
    await rule({ procedureId: p3.id, mode: 'FIXED_AMOUNT', value: 8, priority: 1 }).expect(201);
  });
  afterAll(() => app.close());

  describe('reglas y simulador', () => {
    it('valida las reglas: porcentaje máximo, vigencia y existencia', async () => {
      await rule({ mode: 'PERCENT', value: 120 }).expect(400);
      await rule({ mode: 'PERCENT', value: 10, validTo: '2025-01-01' }).expect(400);
      await rule({ mode: 'PERCENT', value: 10, procedureId: '11111111-1111-4111-8111-111111111111' }).expect(404);
      await rule({ mode: 'FIXED_AMOUNT', value: 150, active: false }).expect(201); // un monto fijo sí puede superar 100
      await api(auditor, 'post', '/commissions/rules', { professionalId, mode: 'PERCENT', value: 10, validFrom: '2026-01-01' }).expect(403);
      await api(auditor, 'get', '/commissions/rules').expect(200);
    });

    it('simula las tres modalidades con la regla vigente (casos verificados a mano)', async () => {
      const sim = (procedureId: string, extra: object = {}) => api(auditor, 'post', '/commissions/simulate', { professionalId, procedureId, ...extra }).expect(200);
      // P1: neto = 100 − 20 (lab) − 10 (5 g × 2) = 70 → 50 % = 35
      expect((await sim(p1.id)).body).toMatchObject({ rule: { mode: 'PERCENT_NET_OF_COSTS' }, price: 100, labCost: 20, materialsCost: 10, calculationBase: 70, commission: 35 });
      // P2: 40 % de 200 = 80
      expect((await sim(p2.id)).body).toMatchObject({ rule: { mode: 'PERCENT' }, commission: 80 });
      // P3: monto fijo de 8 por unidad, 2 unidades = 16
      expect((await sim(p3.id, { quantity: 2 })).body.commission).toBe(16);
      // probar una modalidad sin crear la regla
      expect((await sim(p2.id, { mode: 'PERCENT', value: 10 })).body.commission).toBe(20);
      // un profesional sin reglas
      const none = await api(auditor, 'post', '/commissions/simulate', { professionalId: otherProfessionalId, procedureId: p2.id }).expect(200);
      expect(none.body).toMatchObject({ rule: null, commission: 0 });
    });
  });

  describe('devengo al cobrar y reversión al anular', () => {
    let invoiceId: string;

    it('al emitir la factura se devenga la comisión de cada línea, con su detalle', async () => {
      invoiceId = await charge();
      const entries = await entriesOf(invoiceId);
      expect(entries).toHaveLength(3);
      const amounts = entries.map((e) => Number(e.amount)).sort((a, b) => a - b);
      expect(amounts).toEqual([16, 35, 80]);
      const net = entries.find((e) => Number(e.amount) === 35)!;
      expect(net).toMatchObject({ kind: 'ACCRUAL' });
      expect([Number(net.baseAmount), Number(net.labCost), Number(net.materialsCost)]).toEqual([100, 20, 10]);
    });

    it('anular la factura revierte la comisión sin borrar el devengo original', async () => {
      await api(admin, 'post', `/billing/invoices/${invoiceId}/void`, { reason: 'Error de facturación' }).expect(200);
      const entries = await entriesOf(invoiceId);
      expect(entries).toHaveLength(6);
      expect(entries.filter((e) => e.kind === 'REVERSAL').map((e) => Number(e.amount)).sort((a, b) => a - b)).toEqual([-80, -35, -16]);
      expect(entries.reduce((sum, e) => sum + Number(e.amount), 0)).toBe(0);
    });

    it('una factura sin cita (sin profesional) no devenga comisión', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const res = await api(reception, 'post', '/billing/invoices', { patientId: patient.id, lines: [{ procedureId: p2.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 224 }] }).expect(201);
      expect(await entriesOf(res.body.id)).toHaveLength(0);
    });

    it('las comisiones devengadas no se modifican ni se borran', async () => {
      const entry = (await entriesOf(invoiceId))[0];
      await expect(prisma.db.$executeRaw`UPDATE "CommissionEntry" SET "amount" = 999 WHERE "id" = ${entry.id}`).rejects.toThrow(/reversión/);
      await expect(prisma.db.$executeRaw`DELETE FROM "CommissionEntry" WHERE "id" = ${entry.id}`).rejects.toThrow(/no se pueden eliminar/);
      await expect(prisma.db.$executeRawUnsafe('TRUNCATE "CommissionEntry" CASCADE')).rejects.toThrow(/vaciar/);
    });
  });

  describe('liquidación por período', () => {
    let settlementId: string;

    it('reúne lo pendiente del período (reversiones incluidas) en un borrador', async () => {
      const second = await charge();
      const created = await api(auditor, 'post', '/commissions/settlements', { professionalId, periodStart: day(-1), periodEnd: day(1) }).expect(201);
      settlementId = created.body.id;
      // la primera factura se anuló (neto 0) y la segunda suma 35 + 80 + 16
      expect(created.body).toMatchObject({ status: 'DRAFT', total: 131, professionalId });
      expect(created.body.entries).toHaveLength(9);
      expect((await entriesOf(second)).every((e) => !!e.settlementId)).toBe(true);
      // nada más por liquidar
      await api(auditor, 'post', '/commissions/settlements', { professionalId, periodStart: day(-1), periodEnd: day(1) }).expect(409);
    });

    it('un borrador se puede descartar y sus comisiones vuelven a quedar pendientes', async () => {
      await api(admin, 'delete', `/commissions/settlements/${settlementId}`).expect(200);
      expect(await prisma.db.commissionEntry.count({ where: { settlementId } })).toBe(0);
      const again = await api(auditor, 'post', '/commissions/settlements', { professionalId, periodStart: day(-1), periodEnd: day(1) }).expect(201);
      settlementId = again.body.id;
      expect(again.body.total).toBe(131);
    });

    it('sigue el flujo borrador → aprobada → pagada y no admite saltos', async () => {
      await api(auditor, 'post', `/commissions/settlements/${settlementId}/pay`).expect(409); // aún no aprobada
      expect((await api(auditor, 'post', `/commissions/settlements/${settlementId}/approve`).expect(200)).body.status).toBe('APPROVED');
      await api(auditor, 'post', `/commissions/settlements/${settlementId}/approve`).expect(409);
      await api(admin, 'delete', `/commissions/settlements/${settlementId}`).expect(409); // aprobada: no se descarta
      expect((await api(auditor, 'post', `/commissions/settlements/${settlementId}/pay`).expect(200)).body.status).toBe('PAID');
    });

    it('una liquidación aprobada o pagada no se puede borrar ni siquiera por SQL', async () => {
      await expect(prisma.db.$executeRaw`DELETE FROM "CommissionSettlement" WHERE "id" = ${settlementId}`).rejects.toThrow(/no se puede eliminar/);
    });

    it('genera el comprobante en PDF', async () => {
      const pdf = await api(auditor, 'get', `/commissions/settlements/${settlementId}/pdf`).expect(200);
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.headers['content-disposition']).toMatch(/LIQ-\d{5}\.pdf/);
    });

    it('una reversión posterior queda para la siguiente liquidación (la pagada no cambia)', async () => {
      const third = await charge();
      await api(admin, 'post', `/billing/invoices/${third}/void`, { reason: 'Otro error' }).expect(200);
      const next = await api(auditor, 'post', '/commissions/settlements', { professionalId, periodStart: day(-1), periodEnd: day(1) }).expect(201);
      expect(next.body.total).toBe(0);
      expect((await api(auditor, 'get', `/commissions/settlements/${settlementId}`).expect(200)).body.total).toBe(131);
    });
  });

  describe('permisos: cada quien ve lo suyo', () => {
    it('el odontólogo solo ve sus comisiones y sus liquidaciones aprobadas o pagadas', async () => {
      const own = await api(dentist, 'get', '/commissions/entries').expect(200);
      expect(own.body.total).toBeGreaterThan(0);
      expect(own.body.items.length).toBeGreaterThan(0);
      await api(dentist, 'get', `/commissions/entries?professionalId=${otherProfessionalId}`).expect(403);

      const other = await api(otherDentist, 'get', '/commissions/entries').expect(200);
      expect(other.body.total).toBe(0);
      const list = await api(dentist, 'get', '/commissions/settlements').expect(200);
      expect(list.body.every((s: { status: string }) => s.status !== 'DRAFT')).toBe(true);
      expect(list.body.length).toBeGreaterThan(0);
      expect((await api(otherDentist, 'get', '/commissions/settlements').expect(200)).body).toEqual([]);
      const mine = list.body[0].id;
      await api(dentist, 'get', `/commissions/settlements/${mine}`).expect(200);
      await api(otherDentist, 'get', `/commissions/settlements/${mine}`).expect(404);
      await api(dentist, 'get', `/commissions/settlements/${mine}/pdf`).expect(200);
    });

    it('el odontólogo no crea reglas ni liquidaciones; recepción no accede a nada', async () => {
      await api(dentist, 'post', '/commissions/rules', { professionalId, mode: 'PERCENT', value: 99, validFrom: '2026-01-01' }).expect(403);
      await api(dentist, 'post', '/commissions/settlements', { professionalId, periodStart: day(-1), periodEnd: day(1) }).expect(403);
      await api(dentist, 'post', '/commissions/simulate', { professionalId, procedureId: p1.id }).expect(403);
      for (const path of ['/commissions/rules', '/commissions/entries', '/commissions/settlements']) await api(reception, 'get', path).expect(403);
    });

    it('el auditor ve todas las comisiones; las liquidaciones y aprobaciones quedan auditadas', async () => {
      const all = await api(auditor, 'get', '/commissions/entries?pageSize=100').expect(200);
      expect(all.body.items.length).toBeGreaterThanOrEqual(15);
      const actions = (await prisma.db.auditLog.findMany({ where: { entity: 'Commission' }, select: { action: true } })).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['APPROVE', 'PAY', 'DOWNLOAD', 'SIMULATE', 'CREATE', 'DELETE']));
    });
  });
});
