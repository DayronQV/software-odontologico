import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, createUser, http, login, TestSession } from './helpers';
import { createPatient, createProcedure } from './fixtures';

/** Procedimiento de 100.00 + 12 % de impuesto = 112.00 */
const PRICE = 100;
const TOTAL = 112;

describe('Facturación, pagos mixtos y caja ciega (RF-12, RN-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestSession;
  let auditor: TestSession;
  let dentist: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createSession(app, Role.ADMIN_TI);
    auditor = await createSession(app, Role.AUDITOR);
    dentist = await createSession(app, Role.ODONTOLOGO);
  });
  afterAll(() => app.close());

  /** Una cajera nueva con su caja abierta. */
  async function cashier(openingFloat = 20) {
    const session = await createSession(app, Role.RECEPCIONISTA);
    const opened = await http(app).post('/api/billing/cash-sessions/open').set(bearer(session.accessToken)).send({ openingFloat }).expect(201);
    return { session, cashId: opened.body.id as string, token: session.accessToken };
  }

  async function sale() {
    const procedure = await createProcedure(app, { price: PRICE });
    return { procedure, line: { procedureId: procedure.id, quantity: 1 } };
  }

  const issue = (token: string, body: object) => http(app).post('/api/billing/invoices').set(bearer(token)).send(body);

  describe('apertura de caja', () => {
    it('no se puede cobrar sin caja abierta', async () => {
      const session = await createSession(app, Role.RECEPCIONISTA);
      const patient = await createPatient(app, session.accessToken);
      const { line } = await sale();
      const res = await issue(session.accessToken, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(409);
      expect(res.body.message).toContain('abrir caja');
    });

    it('una sola caja abierta por usuario; la vista no incluye totales del sistema (RN-02)', async () => {
      const { token } = await cashier(30);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(token)).send({ openingFloat: 5 }).expect(409);

      const current = await http(app).get('/api/billing/cash-sessions/current').set(bearer(token)).expect(200);
      expect(Object.keys(current.body.session).sort()).toEqual(['id', 'invoiceCount', 'openedAt', 'openingFloat', 'status']);
      expect(current.body.session).toMatchObject({ status: 'OPEN', openingFloat: 30, invoiceCount: 0 });

      const none = await createSession(app, Role.RECEPCIONISTA);
      const empty = await http(app).get('/api/billing/cash-sessions/current').set(bearer(none.accessToken)).expect(200);
      expect(empty.body).toEqual({ session: null });
    });

    it('valida el fondo inicial y los permisos', async () => {
      const session = await createSession(app, Role.RECEPCIONISTA);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(session.accessToken)).send({ openingFloat: -1 }).expect(400);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(session.accessToken)).send({}).expect(400);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(dentist.accessToken)).send({ openingFloat: 0 }).expect(403);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(auditor.accessToken)).send({ openingFloat: 0 }).expect(403);
    });
  });

  describe('emisión del comprobante con pagos mixtos', () => {
    it('emite con efectivo + tarjeta, calcula impuestos y autoriza fiscalmente (simulado)', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();

      const res = await issue(token, {
        patientId: patient.id,
        lines: [line],
        payments: [
          { method: 'CASH', amount: 50 },
          { method: 'CARD_CREDIT', amount: 62, cardToken: 'tok_visa' },
        ],
      }).expect(201);

      expect(res.body).toMatchObject({
        status: 'ISSUED',
        grossTotal: 100,
        discountTotal: 0,
        netTotal: 100,
        taxTotal: 12,
        total: TOTAL,
        payableTotal: TOTAL,
        currency: 'USD',
      });
      expect(res.body.displayNumber).toMatch(/^F-\d{6}$/);
      expect(res.body.fiscal).toMatchObject({ status: 'AUTHORIZED', provider: 'SIMULADO' });
      expect(res.body.fiscal.folio).toMatch(/^SIM-FAC-/);
      expect(res.body.fiscal.authorizationCode).toMatch(/^\d{10}$/);
      expect(res.body.payments.map((p: { method: string; amount: number }) => [p.method, p.amount])).toEqual([['CASH', 50], ['CARD_CREDIT', 62]]);
      expect(res.body.payments[1].authCode).toMatch(/^\d{6}$/);
      expect(res.body.patient.documentId).toBe(patient.documentId);
    });

    it('admite los cuatro medios de pago en un mismo comprobante', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const res = await issue(token, {
        patientId: patient.id,
        lines: [line],
        payments: [
          { method: 'CASH', amount: 12 },
          { method: 'CARD_DEBIT', amount: 30 },
          { method: 'TRANSFER', amount: 30, reference: 'TRF-0001' },
          { method: 'INSURANCE', amount: 40, reference: 'AUT-778' },
        ],
      }).expect(201);
      expect(res.body.payments).toHaveLength(4);
    });

    it('la suma de los pagos debe ser exactamente el total', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const body = (payments: object[]) => ({ patientId: patient.id, lines: [line], payments });

      expect((await issue(token, body([{ method: 'CASH', amount: 100 }])).expect(400)).body.message).toBe('Faltan 12.00 para completar el pago');
      expect((await issue(token, body([{ method: 'CASH', amount: 120 }])).expect(400)).body.message).toBe('Los pagos superan el total en 8.00');
      await issue(token, body([{ method: 'TRANSFER', amount: TOTAL }])).expect(400); // sin referencia
      await issue(token, body([{ method: 'INSURANCE', amount: TOTAL }])).expect(400);
      await issue(token, body([])).expect(400);
      await issue(token, body([{ method: 'CASH', amount: 0 }])).expect(400);
      await issue(token, body([{ method: 'BITCOIN', amount: TOTAL }])).expect(400);
    });

    it('no se guarda nada cuando el pago falla', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const before = await prisma.db.invoice.count({ where: { patientId: patient.id } });
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: 1 }] }).expect(400);
      expect(await prisma.db.invoice.count({ where: { patientId: patient.id } })).toBe(before);
    });

    it('una tarjeta rechazada responde 402 y se revierten los demás cobros', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const res = await issue(token, {
        patientId: patient.id,
        lines: [line],
        payments: [
          { method: 'CARD_DEBIT', amount: 56, cardToken: 'tok_visa' },
          { method: 'CARD_CREDIT', amount: 56, cardToken: 'tok_declined' },
        ],
      }).expect(402);
      expect(res.body.message).toContain('rechazada');
      expect(await prisma.db.invoice.count({ where: { patientId: patient.id } })).toBe(0);
    });

    it('un fallo de la pasarela responde 502', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CARD_CREDIT', amount: TOTAL, cardToken: 'tok_error' }] }).expect(502);
    });

    it('líneas libres, varias cantidades y descripción del procedimiento', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { procedure } = await sale();
      const res = await issue(token, {
        patientId: patient.id,
        lines: [{ procedureId: procedure.id, quantity: 2 }, { description: 'Kit de higiene', quantity: 1, unitPrice: 10 }],
        payments: [{ method: 'CASH', amount: 235.2 }], // (200 + 10) × 1.12
      }).expect(201);
      expect(res.body.total).toBe(235.2);
      expect(res.body.lines.map((l: { description: string }) => l.description).sort()).toEqual(['Kit de higiene', procedure.name].sort());

      await issue(token, { patientId: patient.id, lines: [{ description: 'Sin precio', quantity: 1 }], payments: [{ method: 'CASH', amount: 1 }] }).expect(400);
      await issue(token, { patientId: patient.id, lines: [{ quantity: 1, unitPrice: 5 }], payments: [{ method: 'CASH', amount: 5.6 }] }).expect(400);
      await issue(token, { patientId: patient.id, lines: [], payments: [{ method: 'CASH', amount: 1 }] }).expect(400);
    });

    it('verifica el paciente y la cita', async () => {
      const { token } = await cashier();
      const { line } = await sale();
      const pay = [{ method: 'CASH', amount: TOTAL }];
      await issue(token, { patientId: '00000000-0000-4000-8000-000000000000', lines: [line], payments: pay }).expect(404);
      await issue(token, { patientId: 'no-uuid', lines: [line], payments: pay }).expect(400);
      const patient = await createPatient(app, token);
      await issue(token, { patientId: patient.id, appointmentId: '00000000-0000-4000-8000-000000000000', lines: [line], payments: pay }).expect(400);
    });
  });

  describe('descuentos autorizados y precios', () => {
    it('recepción puede dar hasta el máximo configurado (10 %); más requiere al administrador', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { procedure } = await sale();
      const body = (discountPercent: number, amount: number) => ({
        patientId: patient.id,
        lines: [{ procedureId: procedure.id, quantity: 1, discountPercent }],
        payments: [{ method: 'CASH', amount }],
      });

      const ok = await issue(token, body(10, 100.8)).expect(201); // 90 + 10.80
      expect(ok.body).toMatchObject({ discountTotal: 10, netTotal: 90, total: 100.8 });
      const denied = await issue(token, body(15, 95.2)).expect(403);
      expect(denied.body.message).toContain('autorización del administrador');

      const adminCash = await http(app).post('/api/billing/cash-sessions/open').set(bearer(admin.accessToken)).send({ openingFloat: 0 });
      expect([201, 409]).toContain(adminCash.status);
      await issue(admin.accessToken, body(50, 56)).expect(201); // el administrador autoriza 50 %
    });

    it('recepción no puede cambiar el precio del catálogo', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { procedure } = await sale();
      const res = await issue(token, {
        patientId: patient.id,
        lines: [{ procedureId: procedure.id, quantity: 1, unitPrice: 1 }],
        payments: [{ method: 'CASH', amount: 1.12 }],
      }).expect(403);
      expect(res.body.message).toContain('precio');
    });
  });

  describe('retenciones', () => {
    it('descuentan del monto a cobrar y quedan registradas', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      // IVA 30 % de 12.00 = 3.60 ; RENTA 10 % de 100.00 = 10.00 ; se cobra 112 − 13.60 = 98.40
      const res = await issue(token, {
        patientId: patient.id,
        lines: [line],
        retentions: [{ type: 'IVA', percent: 30 }, { type: 'RENTA', percent: 10 }],
        payments: [{ method: 'CASH', amount: 98.4 }],
      }).expect(201);
      expect(res.body).toMatchObject({ total: TOTAL, retentionTotal: 13.6, payableTotal: 98.4 });
      expect(res.body.retentions).toEqual([
        { type: 'IVA', percent: 30, amount: 3.6 },
        { type: 'RENTA', percent: 10, amount: 10 },
      ]);
    });
  });

  describe('comprobante en PDF', () => {
    it('descarga un PDF válido y registra la exportación en auditoría', async () => {
      const { token, session } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const invoice = await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);

      const pdf = await http(app).get(`/api/billing/invoices/${invoice.body.id}/pdf`).set(bearer(token)).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain(invoice.body.displayNumber);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((pdf.body as Buffer).length).toBeGreaterThan(1500);

      const logged = await prisma.db.auditLog.findFirst({ where: { entity: 'Invoice', action: 'EXPORT', entityId: invoice.body.id, userId: session.user.id } });
      expect(logged).not.toBeNull();
      await http(app).get('/api/billing/invoices/00000000-0000-4000-8000-000000000000/pdf').set(bearer(token)).expect(404);
    });
  });

  describe('consulta de comprobantes', () => {
    it('lista, filtra y pagina; el auditor puede leer y el odontólogo no', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      for (let i = 0; i < 3; i++) {
        await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);
      }
      const list = await http(app).get('/api/billing/invoices').query({ patientId: patient.id, pageSize: 2 }).set(bearer(auditor.accessToken)).expect(200);
      expect(list.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(list.body.items[0]).toMatchObject({ status: 'ISSUED', methods: ['CASH'], fiscalStatus: 'AUTHORIZED' });
      expect(list.body.items[0].number).toBeGreaterThan(list.body.items[1].number); // más recientes primero

      const voided = await http(app).get('/api/billing/invoices').query({ patientId: patient.id, status: 'VOIDED' }).set(bearer(token)).expect(200);
      expect(voided.body.total).toBe(0);
      await http(app).get('/api/billing/invoices').set(bearer(dentist.accessToken)).expect(403);
      await http(app).get('/api/billing/invoices/no-uuid').set(bearer(token)).expect(400);
      await http(app).get('/api/billing/invoices/00000000-0000-4000-8000-000000000000').set(bearer(token)).expect(404);
    });

    it('no se pueden borrar ni modificar comprobantes por la API ni por SQL', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const invoice = await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);
      await http(app).delete(`/api/billing/invoices/${invoice.body.id}`).set(bearer(admin.accessToken)).expect(404);
      await expect(prisma.db.$executeRaw`DELETE FROM "Invoice" WHERE "id" = ${invoice.body.id}`).rejects.toThrow(/no se pueden eliminar/);
      await expect(prisma.db.$executeRaw`DELETE FROM "Payment" WHERE "invoiceId" = ${invoice.body.id}`).rejects.toThrow(/no se pueden eliminar/);
    });
  });

  describe('anulación con nota de crédito', () => {
    it('solo el administrador anula; se emite nota de crédito y se devuelve el efectivo', async () => {
      const { token } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const invoice = await issue(token, {
        patientId: patient.id,
        lines: [line],
        payments: [{ method: 'CASH', amount: 50 }, { method: 'CARD_CREDIT', amount: 62, cardToken: 'tok_visa' }],
      }).expect(201);
      const voidUrl = `/api/billing/invoices/${invoice.body.id}/void`;

      await http(app).post(voidUrl).set(bearer(token)).send({ reason: 'Error de digitación' }).expect(403);
      await http(app).post(voidUrl).set(bearer(admin.accessToken)).send({}).expect(400);

      // El administrador necesita su propia caja abierta para devolver efectivo
      const adminSession = await createSession(app, Role.ADMIN_TI);
      await http(app).post(voidUrl).set(bearer(adminSession.accessToken)).send({ reason: 'Error' }).expect(409);
      const adminCash = await http(app).post('/api/billing/cash-sessions/open').set(bearer(adminSession.accessToken)).send({ openingFloat: 0 }).expect(201);

      const voided = await http(app).post(voidUrl).set(bearer(adminSession.accessToken)).send({ reason: 'Error de digitación' }).expect(200);
      expect(voided.body.status).toBe('VOIDED');
      expect(voided.body.void).toMatchObject({ reason: 'Error de digitación', creditNote: { total: TOTAL } });
      expect(voided.body.void.creditNote.displayNumber).toMatch(/^NC-\d{6}$/);
      expect(voided.body.void.creditNote.fiscalFolio).toMatch(/^SIM-NC-/);

      const refund = await prisma.db.cashMovement.findFirstOrThrow({ where: { cashSessionId: adminCash.body.id } });
      expect(Number(refund.amount)).toBe(50); // solo el efectivo
      await http(app).post(voidUrl).set(bearer(adminSession.accessToken)).send({ reason: 'Otra vez' }).expect(409);
      await http(app).get(`/api/billing/invoices/${invoice.body.id}`).set(bearer(token)).expect(200); // sigue consultable
    });
  });

  describe('RN-02: cierre de caja ciego', () => {
    it('el conteo es obligatorio y recién entonces se muestran el esperado y la diferencia', async () => {
      const { token, cashId } = await cashier(20);
      const patient = await createPatient(app, token);
      const { line } = await sale();
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: 50 }, { method: 'CARD_DEBIT', amount: 62, cardToken: 'tok_x' }] }).expect(201);
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);
      // efectivo esperado = fondo 20 + 50 + 112 = 182

      // Antes de contar, la recepcionista no ve ningún total del sistema
      const current = await http(app).get('/api/billing/cash-sessions/current').set(bearer(token)).expect(200);
      expect(current.body.session.invoiceCount).toBe(2);
      expect(JSON.stringify(current.body)).not.toMatch(/expected|difference|182|total/i);

      // No se puede cerrar sin contar
      await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(token)).send({}).expect(400);
      await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(token)).send({ countedCash: -5 }).expect(400);

      // Con el conteo (faltan 2.00), el sistema calcula y muestra la diferencia
      const closed = await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(token)).send({ countedCash: 180, notes: 'Faltante por vuelto' }).expect(200);
      expect(closed.body).toMatchObject({ status: 'CLOSED', openingFloat: 20, countedCash: 180, expectedCash: 182, difference: -2 });

      await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(token)).send({ countedCash: 182 }).expect(409); // ya cerrada
      const after = await http(app).get('/api/billing/cash-sessions/current').set(bearer(token)).expect(200);
      expect(after.body.session).toBeNull();
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(token)).send({ openingFloat: 0 }).expect(201); // puede abrir otra
    });

    it('las anulaciones descuentan del efectivo esperado', async () => {
      const { token, cashId } = await cashier(0);
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const first = await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: TOTAL }] }).expect(201);

      const adminSession = await createSession(app, Role.ADMIN_TI);
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(adminSession.accessToken)).send({ openingFloat: 0 }).expect(201);
      // el administrador anula el primero: se devuelven 112 desde SU caja
      await http(app).post(`/api/billing/invoices/${first.body.id}/void`).set(bearer(adminSession.accessToken)).send({ reason: 'Devolución' }).expect(200);

      const closed = await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(token)).send({ countedCash: 224 }).expect(200);
      expect(closed.body.expectedCash).toBe(224); // la caja de la cajera conserva sus cobros
      const adminReport = await http(app).get(`/api/billing/cash-sessions/${(await prisma.db.cashSession.findFirstOrThrow({ where: { openedById: adminSession.user.id } })).id}/report`).set(bearer(admin.accessToken)).expect(200);
      expect(adminReport.body).toMatchObject({ cashRefunds: 112, expectedCash: -112 });
    });

    it('solo quien abrió la caja (o el administrador) puede cerrarla', async () => {
      const { cashId } = await cashier();
      const other = await createSession(app, Role.RECEPCIONISTA);
      await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(other.accessToken)).send({ countedCash: 20 }).expect(403);
      await http(app).post(`/api/billing/cash-sessions/${cashId}/close`).set(bearer(admin.accessToken)).send({ countedCash: 20 }).expect(200);
      await http(app).post('/api/billing/cash-sessions/00000000-0000-4000-8000-000000000000/close').set(bearer(admin.accessToken)).send({ countedCash: 1 }).expect(404);
    });

    it('los reportes con totales del sistema son del administrador y del auditor, NO de recepción', async () => {
      const { token, cashId } = await cashier(10);
      const patient = await createPatient(app, token);
      const { line } = await sale();
      await issue(token, { patientId: patient.id, lines: [line], payments: [{ method: 'CASH', amount: 62 }, { method: 'TRANSFER', amount: 50, reference: 'T-1' }] }).expect(201);

      await http(app).get(`/api/billing/cash-sessions/${cashId}/report`).set(bearer(token)).expect(403);
      await http(app).get('/api/billing/cash-sessions').set(bearer(token)).expect(403);
      await http(app).get(`/api/billing/cash-sessions/${cashId}/report`).set(bearer(dentist.accessToken)).expect(403);

      const report = await http(app).get(`/api/billing/cash-sessions/${cashId}/report`).set(bearer(auditor.accessToken)).expect(200);
      expect(report.body).toMatchObject({ status: 'OPEN', openingFloat: 10, expectedCash: 72, invoicesIssued: 1, invoicesVoided: 0, difference: null });
      const byMethod = Object.fromEntries(report.body.payments.map((p: { method: string; total: number }) => [p.method, p.total]));
      expect(byMethod).toEqual({ CASH: 62, TRANSFER: 50 });

      const list = await http(app).get('/api/billing/cash-sessions').query({ pageSize: 5 }).set(bearer(admin.accessToken)).expect(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      expect(list.body.items[0]).toHaveProperty('openedBy');
    });
  });

  describe('auditoría de operaciones financieras', () => {
    it('cada emisión queda registrada sin copiar referencias ni tokens', async () => {
      const { token, session } = await cashier();
      const patient = await createPatient(app, token);
      const { line } = await sale();
      const invoice = await issue(token, {
        patientId: patient.id,
        lines: [line],
        payments: [{ method: 'CARD_CREDIT', amount: 62, cardToken: 'tok_visa' }, { method: 'TRANSFER', amount: 50, reference: 'REF-SECRETA-9' }],
      }).expect(201);
      const log = await prisma.db.auditLog.findFirstOrThrow({ where: { entity: 'Invoice', action: 'CREATE', entityId: invoice.body.id } });
      expect(log.userId).toBe(session.user.id);
      const text = JSON.stringify(log.after);
      expect(text).not.toContain('REF-SECRETA-9');
      expect(text).not.toContain('tok_visa');
    });

    it('operar caja y facturar exige MFA: un token sin segundo factor es rechazado', async () => {
      const user = await createUser(app, Role.RECEPCIONISTA);
      const partial = (await login(app, user.email, user.password)).body;
      await http(app).post('/api/billing/cash-sessions/open').set(bearer(partial.accessToken)).send({ openingFloat: 0 }).expect(403);
      await http(app).get('/api/billing/invoices').set(bearer(partial.accessToken)).expect(403);
    });
  });
});
