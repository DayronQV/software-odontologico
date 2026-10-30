import { describe, expect, it } from 'vitest';
import {
  buildInvoicePayload,
  calculatePosTotals,
  paidCents,
  paymentsProblem,
  type PosLine,
  type PosPayment,
} from './pos-calculations';

const line = (unitPrice: number, quantity = 1, discountPercent = 0, procedureId: string | null = 'proc-1'): PosLine => ({
  key: `k${unitPrice}${quantity}`, procedureId, description: 'Procedimiento', unitPrice, quantity, discountPercent,
});
const pay = (method: PosPayment['method'], amount: number, reference = ''): PosPayment => ({ key: `${method}${amount}`, method, amount, reference, cardToken: 'tok_visa' });

describe('cálculo de la venta (igual que el servidor)', () => {
  it('100.00 + 12 % = 112.00', () => {
    const t = calculatePosTotals([line(100)], 12, []);
    expect(t).toMatchObject({ grossCents: 10_000, netCents: 10_000, taxCents: 1_200, totalCents: 11_200, payableCents: 11_200 });
  });

  it('aplica el descuento antes del impuesto y respeta la cantidad', () => {
    const t = calculatePosTotals([line(50, 2, 10)], 12, []);
    expect(t).toMatchObject({ discountCents: 1_000, netCents: 9_000, taxCents: 1_080, totalCents: 10_080 });
  });

  it('no acumula errores de coma flotante', () => {
    expect(calculatePosTotals([line(0.1), line(0.2)], 0, []).totalCents).toBe(30);
  });

  it('retenciones: IVA sobre el impuesto, renta sobre la base; se cobra total − retenciones', () => {
    const t = calculatePosTotals([line(100)], 12, [{ type: 'IVA', percent: 30 }, { type: 'RENTA', percent: 10 }]);
    expect(t.retentionCents).toBe(360 + 1_000);
    expect(t.payableCents).toBe(11_200 - 1_360);
  });
});

describe('pagos mixtos (RF-12)', () => {
  it('acepta efectivo + tarjeta con suma exacta', () => {
    const payments = [pay('CASH', 50), pay('CARD_CREDIT', 62)];
    expect(paidCents(payments)).toBe(11_200);
    expect(paymentsProblem(payments, 11_200)).toBeNull();
  });

  it('informa cuánto falta o sobra', () => {
    expect(paymentsProblem([pay('CASH', 100)], 11_200)).toBe('Faltan 12.00 para completar el pago');
    expect(paymentsProblem([pay('CASH', 120)], 11_200)).toBe('Los pagos superan el total en 8.00');
  });

  it('exige referencia en transferencias y seguros, y montos positivos', () => {
    expect(paymentsProblem([pay('TRANSFER', 112)], 11_200)).toContain('referencia');
    expect(paymentsProblem([pay('INSURANCE', 112)], 11_200)).toContain('autorización');
    expect(paymentsProblem([pay('TRANSFER', 112, 'T-1')], 11_200)).toBeNull();
    expect(paymentsProblem([pay('CASH', 0)], 0)).toContain('mayor a cero');
    expect(paymentsProblem([], 100)).toContain('al menos un pago');
  });
});

describe('cuerpo de la factura', () => {
  it('las líneas del catálogo envían el procedimiento (el precio lo fija el servidor); las libres, su precio', () => {
    const payload = buildInvoicePayload({
      patientId: 'p1',
      lines: [line(100, 2, 5), line(10, 1, 0, null)],
      payments: [pay('CARD_DEBIT', 50), pay('CASH', 50)],
      retentions: [],
      notes: '  ',
    });
    expect(payload.lines[0]).toEqual({ procedureId: 'proc-1', quantity: 2, discountPercent: 5 });
    expect(payload.lines[1]).toEqual({ description: 'Procedimiento', unitPrice: 10, quantity: 1, discountPercent: undefined });
    expect(payload.payments[0]).toMatchObject({ method: 'CARD_DEBIT', cardToken: 'tok_visa' });
    expect(payload.payments[1].cardToken).toBeUndefined(); // el efectivo no lleva token
    expect(payload.retentions).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });
});
