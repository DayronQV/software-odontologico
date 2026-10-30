import { calculateInvoice } from './invoice-calculator';

const line = (unitPriceCents: number, quantity = 1, discountPercent = 0) => ({
  unitPriceCents,
  quantity,
  discountPercent,
});

describe('cálculo de comprobantes (RF-12)', () => {
  it('una línea simple con impuesto', () => {
    const t = calculateInvoice([line(10_000)], 12); // 100.00 + 12 %
    expect(t).toMatchObject({ grossCents: 10_000, discountCents: 0, netCents: 10_000, taxCents: 1_200, totalCents: 11_200, payableCents: 11_200 });
  });

  it('multiplica por la cantidad y aplica descuento antes del impuesto', () => {
    const t = calculateInvoice([line(5_000, 2, 10)], 12); // 2 × 50 = 100; −10 % = 90; IVA 10.80
    expect(t.lines[0]).toEqual({ grossCents: 10_000, discountCents: 1_000, netCents: 9_000, taxCents: 1_080, totalCents: 10_080 });
    expect(t.totalCents).toBe(10_080);
  });

  it('suma varias líneas', () => {
    const t = calculateInvoice([line(4_000), line(6_000, 1, 50)], 0);
    expect(t).toMatchObject({ grossCents: 10_000, discountCents: 3_000, netCents: 7_000, taxCents: 0, totalCents: 7_000 });
  });

  it('no acumula errores de coma flotante (0.10 + 0.20 = 0.30)', () => {
    const t = calculateInvoice([line(10), line(20)], 0);
    expect(t.totalCents).toBe(30);
  });

  it('redondea el impuesto al centavo por línea', () => {
    const t = calculateInvoice([line(333)], 12); // 3.33 × 12 % = 0.3996 → 0.40
    expect(t.taxCents).toBe(40);
    expect(t.totalCents).toBe(373);
  });

  it('retenciones: IVA sobre el impuesto, RENTA sobre el neto; el cobro es total − retenciones', () => {
    const t = calculateInvoice([line(10_000)], 12, [
      { type: 'IVA', percent: 30 }, // 30 % de 12.00 = 3.60
      { type: 'RENTA', percent: 10 }, // 10 % de 100.00 = 10.00
    ]);
    expect(t.retentions.map((r) => [r.type, r.amountCents])).toEqual([['IVA', 360], ['RENTA', 1_000]]);
    expect(t.retentionCents).toBe(1_360);
    expect(t.totalCents).toBe(11_200);
    expect(t.payableCents).toBe(9_840);
  });

  it('un comprobante vacío da cero', () => {
    expect(calculateInvoice([], 12)).toMatchObject({ totalCents: 0, payableCents: 0 });
  });
});
