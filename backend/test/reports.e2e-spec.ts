import { INestApplication } from '@nestjs/common';
import { CommissionEntryKind, Role, StockMovementType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { createChairs, createPatient, createProcedure, createProfessional, postAppointment, slot } from './fixtures';
import { bearer, createSession, createTestApp, enrollSession, http, TestSession } from './helpers';

const REPORT_KEYS = ['cash', 'revenue', 'receivables', 'agenda', 'procedures', 'budgets', 'inventory', 'fees'];
const today = new Date().toISOString().slice(0, 10);
const range = `from=${new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`;

describe('Reportes BI y exportación auditada', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;
  let auditor: TestSession;
  let reception: TestSession;
  let assistant: TestSession;
  let dentist: TestSession;
  let otherDentist: TestSession;
  let professionalId: string;
  let otherProfessionalId: string;
  let procedureId: string;

  const get = (who: TestSession, url: string) => http(app).get(`/api${url}`).set(bearer(who.accessToken));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
    auditor = await createSession(app, Role.AUDITOR);
    reception = await createSession(app, Role.RECEPCIONISTA);
    assistant = await createSession(app, Role.ASISTENTE);
    const a = await createProfessional(app);
    professionalId = a.professionalId;
    dentist = await enrollSession(app, a.user);
    const b = await createProfessional(app);
    otherProfessionalId = b.professionalId;
    otherDentist = await enrollSession(app, b.user);

    // Una venta atribuida al primer profesional, una cita a cada uno y un procedimiento realizado
    await http(app).post('/api/billing/cash-sessions/open').set(bearer(reception.accessToken)).send({ openingFloat: 10 }).expect(201);
    const { chairs } = await createChairs(app, 2);
    const procedure = await createProcedure(app, { price: 100 });
    procedureId = procedure.id;
    const patient = await createPatient(app, reception.accessToken);
    const appointment = await postAppointment(app, reception.accessToken, { patientId: patient.id, professionalId, chairId: chairs[0].id, procedureIds: [procedureId], ...slot(2, 9) }).expect(201);
    await postAppointment(app, reception.accessToken, { patientId: (await createPatient(app, reception.accessToken)).id, professionalId: otherProfessionalId, chairId: chairs[1].id, procedureIds: [procedureId], ...slot(2, 9) }).expect(201);
    await http(app)
      .post('/api/billing/invoices')
      .set(bearer(reception.accessToken))
      .send({ patientId: patient.id, appointmentId: appointment.body.id, lines: [{ procedureId, quantity: 1 }], payments: [{ method: 'CASH', amount: 112 }] })
      .expect(201);
    await http(app).post(`/api/patients/${patient.id}/procedure-records`).set(bearer(dentist.accessToken)).send({ procedureId }).expect(201);
  });
  afterAll(() => app.close());

  describe('catálogo y permisos', () => {
    it('administración y contabilidad ven los 8 reportes; el odontólogo solo los suyos', async () => {
      for (const who of [admin, auditor]) {
        const keys = ((await get(who, '/reports').expect(200)).body as Array<{ key: string }>).map((r) => r.key);
        expect(keys).toEqual(expect.arrayContaining(REPORT_KEYS));
      }
      const own = ((await get(dentist, '/reports').expect(200)).body as Array<{ key: string }>).map((r) => r.key);
      expect(own.sort()).toEqual(['agenda', 'procedures', 'revenue']);
    });

    it('recepción y asistente no acceden a los reportes ni a los totales de caja', async () => {
      for (const who of [reception, assistant]) {
        await get(who, '/reports').expect(403);
        await get(who, '/reports/cash').expect(403);
        await get(who, '/reports/dashboard').expect(403);
        await get(who, '/reports/cash/export?format=csv').expect(403);
      }
    });

    it('el odontólogo no ve reportes financieros globales y solo sus propios indicadores', async () => {
      await get(dentist, '/reports/cash').expect(403);
      await get(dentist, '/reports/receivables').expect(403);
      await get(dentist, '/reports/dashboard').expect(403);
      await get(dentist, `/reports/revenue?${range}&professionalId=${otherProfessionalId}`).expect(403);
      const mine = (await get(dentist, `/reports/revenue?${range}`).expect(200)).body;
      expect(mine.totals.total).toBe(112);
      const other = (await get(otherDentist, `/reports/revenue?${range}`).expect(200)).body;
      expect(other.rows).toEqual([]);
    });

    it('un reporte inexistente o un período inválido se rechazan', async () => {
      await get(admin, '/reports/inventado').expect(404);
      await get(admin, '/reports/revenue?from=2026-13-45').expect(400);
      await get(admin, '/reports/revenue?from=2026-05-01&to=2026-01-01').expect(400);
      await get(admin, '/reports/revenue?from=2020-01-01&to=2026-01-01').expect(400); // más de 400 días
      await get(admin, '/reports/revenue?groupBy=inventado').expect(400);
    });
  });

  describe('contenido de los reportes', () => {
    it.each(REPORT_KEYS)('%s: devuelve columnas, filas y el período', async (key) => {
      const report = (await get(auditor, `/reports/${key}?${range}`).expect(200)).body;
      expect(report).toMatchObject({ key, title: expect.any(String), subtitle: expect.any(String) });
      expect(report.columns.length).toBeGreaterThan(2);
      expect(Array.isArray(report.rows)).toBe(true);
    });

    it('ingresos: por profesional, procedimiento, consultorio y día; filtrable', async () => {
      for (const groupBy of ['professional', 'procedure', 'office', 'day']) {
        const report = (await get(admin, `/reports/revenue?${range}&groupBy=${groupBy}`).expect(200)).body;
        expect(report.totals.total).toBeGreaterThanOrEqual(112);
      }
      const byDay = (await get(admin, `/reports/revenue?${range}&groupBy=day`).expect(200)).body;
      expect(byDay.rows.some((r: { label: string; total: number }) => r.label === today && r.total >= 112)).toBe(true);
      const filtered = (await get(admin, `/reports/revenue?${range}&professionalId=${otherProfessionalId}`).expect(200)).body;
      expect(filtered.rows).toEqual([]);
    });

    it('corte de caja: ingresos por método de pago y diferencias del cierre', async () => {
      const report = (await get(auditor, `/reports/cash?${range}`).expect(200)).body;
      expect(report.totals.cash).toBeGreaterThanOrEqual(112);
      expect(report.columns.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['expectedCash', 'countedCash', 'difference']));
    });

    it('agenda: ocupación de sillones, No-Show y efectividad de los recordatorios', async () => {
      const report = (await get(auditor, `/reports/agenda?from=${today}&to=${new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)}`).expect(200)).body;
      expect(report.totals.total).toBeGreaterThanOrEqual(2);
      expect(report.totals).toHaveProperty('noShowRate');
      expect(report.totals).toHaveProperty('noShowWithReminder');
      expect(report.totals).toHaveProperty('noShowWithoutReminder');
      expect(report.rows[0]).toHaveProperty('occupancy');
    });

    it('clínico-administrativos: procedimientos más realizados y conversión de presupuestos', async () => {
      const procedures = (await get(auditor, `/reports/procedures?${range}`).expect(200)).body;
      expect(procedures.rows.length).toBeGreaterThan(0);
      const budgets = (await get(auditor, `/reports/budgets?${range}`).expect(200)).body;
      expect(budgets.totals).toHaveProperty('conversionRate');
    });

    it('honorarios e inventario', async () => {
      const fees = (await get(auditor, `/reports/fees?${range}`).expect(200)).body;
      expect(fees.columns.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['accrued', 'settled', 'pending']));
      const inventory = (await get(auditor, '/reports/inventory').expect(200)).body;
      expect(inventory.columns.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['stock', 'value', 'consumed', 'waste', 'nextExpiry']));
    });
  });

  describe('panel de indicadores', () => {
    it('muestra KPIs y series, y la segunda consulta sale de la caché de Redis', async () => {
      const first = (await get(auditor, `/reports/dashboard?${range}`).expect(200)).body;
      expect(first.kpis).toEqual(expect.objectContaining({ revenue: expect.any(Number), noShowRate: expect.any(Number), budgetConversion: expect.any(Number), lowStock: expect.any(Number), pendingCommissions: expect.any(Number) }));
      expect(first.kpis.revenue).toBeGreaterThanOrEqual(112);
      expect(first.revenueByDay.length).toBeGreaterThan(0);
      expect(first.paymentMethods.some((m: { method: string }) => m.method === 'CASH')).toBe(true);
      expect(first.cached).toBe(false);
      const second = (await get(admin, `/reports/dashboard?${range}`).expect(200)).body;
      expect(second.cached).toBe(true);
      expect(second.kpis).toEqual(first.kpis);
    });
  });

  describe('exportación PDF/CSV auditada (RNF-06)', () => {
    it('exporta CSV con BOM y PDF válido', async () => {
      const csv = await get(auditor, `/reports/revenue/export?${range}&format=csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toMatch(/revenue-\d{4}-\d{2}-\d{2}\.csv/);
      expect(csv.text.startsWith('﻿')).toBe(true);
      const pdf = await get(auditor, `/reports/revenue/export?${range}&format=pdf`).expect(200);
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
      await get(auditor, '/reports/revenue/export?format=xls').expect(400);
      await get(auditor, '/reports/revenue/export').expect(400);
    });

    it('cada exportación queda en el log de auditoría, con quién y qué se pidió', async () => {
      const before = await prisma.db.auditLog.count({ where: { entity: 'Report', action: 'EXPORT' } });
      await get(admin, `/reports/agenda/export?${range}&format=csv`).expect(200);
      await get(dentist, `/reports/revenue/export?${range}&format=pdf`).expect(200);
      const exports = await prisma.db.auditLog.findMany({ where: { entity: 'Report', action: 'EXPORT' }, orderBy: { id: 'desc' }, take: 2 });
      expect(await prisma.db.auditLog.count({ where: { entity: 'Report', action: 'EXPORT' } })).toBe(before + 2);
      expect(exports.map((e) => e.role).sort()).toEqual([Role.ADMIN_TI, Role.ODONTOLOGO].sort());
    });

    it('una exportación rechazada (sin permiso) no se confunde con una realizada', async () => {
      const before = await prisma.db.auditLog.count({ where: { entity: 'Report', action: 'EXPORT' } });
      await get(reception, `/reports/revenue/export?${range}&format=csv`).expect(403);
      expect(await prisma.db.auditLog.count({ where: { entity: 'Report', action: 'EXPORT' } })).toBe(before);
    });
  });

  describe('separación de funciones: el auditor no lee datos clínicos', () => {
    it('no accede al expediente, a las recetas ni a los planes', async () => {
      const patient = await createPatient(app, reception.accessToken);
      for (const path of ['odontogram', 'notes', 'prescriptions', 'attachments', 'consents', 'treatment-plans', 'timeline']) {
        await get(auditor, `/patients/${patient.id}/${path}`).expect(403);
      }
      await get(auditor, '/patients').expect(403);
    });
  });

  describe('rendimiento con volumen de datos', () => {
    it('los reportes de inventario y honorarios responden en menos de 1,5 s con ~30 000 filas', async () => {
      const item = await prisma.db.inventoryItem.create({ data: { code: `P${Date.now().toString(36)}`.toUpperCase(), name: 'Insumo de volumen', unit: 'u', unitCost: 1 } });
      const location = await prisma.db.stockLocation.create({ data: { name: 'Ubicación de volumen', professionalId: randomUUID() } });
      const moves = Array.from({ length: 15_000 }, (_, i) => ({ itemId: item.id, locationId: location.id, type: i % 3 === 0 ? StockMovementType.ENTRY : StockMovementType.CONSUMPTION, quantity: i % 3 === 0 ? 5 : -1, unitCost: 1, createdById: admin.user.id }));
      await prisma.db.stockMovement.createMany({ data: moves });
      const entries = Array.from({ length: 15_000 }, () => ({
        professionalId,
        invoiceId: randomUUID(),
        invoiceLineId: randomUUID(),
        kind: CommissionEntryKind.ACCRUAL,
        baseAmount: 100,
        labCost: 0,
        materialsCost: 0,
        amount: 40,
      }));
      await prisma.db.commissionEntry.createMany({ data: entries });

      const timings: Record<string, number> = {};
      for (const key of ['inventory', 'fees', 'revenue', 'agenda']) {
        const t0 = performance.now();
        await get(auditor, `/reports/${key}?${range}`).expect(200);
        timings[key] = performance.now() - t0;
      }
      const dash = performance.now();
      await get(auditor, `/reports/dashboard?from=${today}&to=${today}`).expect(200);
      timings.dashboard = performance.now() - dash;
      console.info(`Reportes con volumen: ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(' · ')}`);
      for (const [key, ms] of Object.entries(timings)) expect({ key, ok: ms < 1500 }).toEqual({ key, ok: true });
    });
  });
});
