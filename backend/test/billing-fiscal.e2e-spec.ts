import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FISCAL_INVOICE_PROVIDER } from '../src/integrations/fiscal/fiscal-invoice-provider';
import { bearer, createSession, createTestApp, http } from './helpers';
import { createPatient, createProcedure } from './fixtures';

/**
 * El proveedor fiscal es externo y puede fallar. El comprobante se emite igualmente, queda
 * PENDIENTE de autorización y se puede reintentar (la interfaz permite cambiar de proveedor).
 */
describe('Autorización fiscal pendiente y reintento (RF-12)', () => {
  let app: INestApplication;
  const authorize = jest.fn();

  beforeAll(async () => {
    app = await createTestApp([], (builder) =>
      builder.overrideProvider(FISCAL_INVOICE_PROVIDER).useValue({ authorize }),
    );
  });
  afterAll(() => app.close());

  it('si el proveedor falla queda PENDIENTE; el reintento lo autoriza', async () => {
    authorize.mockRejectedValueOnce(new Error('Proveedor fiscal fuera de línea'));
    authorize.mockResolvedValueOnce({
      provider: 'PRUEBA',
      folio: 'FOLIO-123',
      authorizationCode: '9999999999',
      stampedAt: new Date(),
    });

    const cashier = await createSession(app, Role.RECEPCIONISTA);
    const token = cashier.accessToken;
    await http(app).post('/api/billing/cash-sessions/open').set(bearer(token)).send({ openingFloat: 0 }).expect(201);
    const patient = await createPatient(app, token);
    const procedure = await createProcedure(app, { price: 100 });

    const issued = await http(app)
      .post('/api/billing/invoices')
      .set(bearer(token))
      .send({ patientId: patient.id, lines: [{ procedureId: procedure.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 112 }] })
      .expect(201);
    expect(issued.body.status).toBe('ISSUED');
    expect(issued.body.fiscal).toMatchObject({ status: 'PENDING', folio: null, error: 'Proveedor fiscal fuera de línea' });

    const retried = await http(app).post(`/api/billing/invoices/${issued.body.id}/fiscal-retry`).set(bearer(token)).expect(200);
    expect(retried.body.fiscal).toMatchObject({ status: 'AUTHORIZED', provider: 'PRUEBA', folio: 'FOLIO-123', error: null });
    expect(authorize).toHaveBeenCalledTimes(2);

    await http(app).post('/api/billing/invoices/00000000-0000-4000-8000-000000000000/fiscal-retry').set(bearer(token)).expect(404);
  });
});
