import { PaymentMethod as M } from '@prisma/client';
import { fromCents, percentOf, toCents } from '../../common/money';
import { computeCashSummary } from './cash-summary';
import { formatCreditNoteNumber, formatInvoiceNumber } from './document-number';
import { validatePayments } from './payments-validator';

describe('validación de pagos mixtos (RF-12)', () => {
  it('acepta efectivo + tarjeta cuya suma es exacta', () => {
    const payments = [
      { method: M.CASH, amountCents: 5_000 },
      { method: M.CARD_CREDIT, amountCents: 6_200 },
    ];
    expect(validatePayments(payments, 11_200)).toBeNull();
  });

  it('acepta los cuatro medios en un mismo comprobante', () => {
    const payments = [
      { method: M.CASH, amountCents: 1_000 },
      { method: M.CARD_DEBIT, amountCents: 1_000 },
      { method: M.TRANSFER, amountCents: 1_000, reference: 'TRF-1' },
      { method: M.INSURANCE, amountCents: 1_000, reference: 'AUT-9' },
    ];
    expect(validatePayments(payments, 4_000)).toBeNull();
  });

  it('informa cuánto falta o cuánto sobra', () => {
    expect(validatePayments([{ method: M.CASH, amountCents: 9_000 }], 10_000)).toBe('Faltan 10.00 para completar el pago');
    expect(validatePayments([{ method: M.CASH, amountCents: 10_500 }], 10_000)).toBe('Los pagos superan el total en 5.00');
  });

  it('exige referencia en transferencias y seguros', () => {
    expect(validatePayments([{ method: M.TRANSFER, amountCents: 100 }], 100)).toContain('referencia');
    expect(validatePayments([{ method: M.INSURANCE, amountCents: 100, reference: '  ' }], 100)).toContain('autorización');
  });

  it('rechaza montos no positivos o no enteros y listas vacías', () => {
    expect(validatePayments([], 100)).toContain('al menos un pago');
    expect(validatePayments([{ method: M.CASH, amountCents: 0 }], 0)).toContain('mayor a cero');
    expect(validatePayments([{ method: M.CASH, amountCents: 10.5 }], 10.5)).toContain('mayor a cero');
  });
});

describe('cierre de caja (RN-02)', () => {
  it('esperado = fondo + efectivo cobrado − devoluciones; diferencia = contado − esperado', () => {
    expect(
      computeCashSummary({ openingFloatCents: 5_000, cashPaymentsCents: 20_000, refundsCents: 3_000, countedCents: 22_000 }),
    ).toEqual({ expectedCents: 22_000, differenceCents: 0 });
  });

  it('faltante (negativo) y sobrante (positivo)', () => {
    const base = { openingFloatCents: 0, cashPaymentsCents: 10_000, refundsCents: 0 };
    expect(computeCashSummary({ ...base, countedCents: 9_500 }).differenceCents).toBe(-500);
    expect(computeCashSummary({ ...base, countedCents: 10_250 }).differenceCents).toBe(250);
  });
});

describe('dinero y numeración', () => {
  it('convierte a centavos sin errores de coma flotante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1_999);
    expect(fromCents(1_999)).toBe(19.99);
    expect(percentOf(1_000, 12)).toBe(120);
  });

  it('formatea números de comprobante y nota de crédito', () => {
    expect(formatInvoiceNumber(7)).toBe('F-000007');
    expect(formatCreditNoteNumber(123)).toBe('NC-000123');
  });
});
