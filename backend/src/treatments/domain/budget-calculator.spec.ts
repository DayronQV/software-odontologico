import {
  approvedTotal,
  calculateBudget,
  requiresDiscountAuthorization,
  type BudgetLineInput,
} from './budget-calculator';

const line = (itemId: string, phasePosition: number, feeCents: number, labCents = 0): BudgetLineInput => ({
  itemId,
  phasePosition,
  phaseName: `Fase ${phasePosition}`,
  feeCents,
  labCents,
});

describe('cálculo del presupuesto (RF-07)', () => {
  const lines = [
    line('a', 1, 26_000, 2_000), // endodoncia: 260,00 + lab 20,00
    line('b', 2, 7_500), // resina: 75,00
    line('c', 2, 32_000, 9_000), // corona: 320,00 + lab 90,00
  ];

  it('suma honorarios, laboratorio y total sin descuento', () => {
    const totals = calculateBudget(lines, 0);
    expect(totals).toMatchObject({ feesCents: 65_500, labCents: 11_000, discountCents: 0, totalCents: 76_500 });
  });

  it('el descuento se aplica solo a los honorarios; el laboratorio no se descuenta', () => {
    const totals = calculateBudget(lines, 10);
    expect(totals.discountCents).toBe(2_600 + 750 + 3_200);
    expect(totals.totalCents).toBe(65_500 - 6_550 + 11_000);
  });

  it('calcula los totales por fase y suman el total general', () => {
    const totals = calculateBudget(lines, 10);
    expect(totals.phases.map((p) => [p.position, p.name])).toEqual([[1, 'Fase 1'], [2, 'Fase 2']]);
    expect(totals.phases[0]).toMatchObject({ feesCents: 26_000, labCents: 2_000, discountCents: 2_600, totalCents: 25_400 });
    expect(totals.phases[1]).toMatchObject({ feesCents: 39_500, labCents: 9_000, discountCents: 3_950, totalCents: 44_550 });
    expect(totals.phases.reduce((sum, p) => sum + p.totalCents, 0)).toBe(totals.totalCents);
  });

  it('trabaja en centavos enteros: sin errores de coma flotante', () => {
    const totals = calculateBudget([line('x', 1, 1_010), line('y', 1, 2_020)], 33.33);
    expect(Number.isInteger(totals.totalCents)).toBe(true);
    expect(Number.isInteger(totals.discountCents)).toBe(true);
    expect(totals.discountCents).toBe(337 + 673);
  });

  it('un presupuesto vacío da cero', () => {
    expect(calculateBudget([], 15)).toMatchObject({ feesCents: 0, totalCents: 0, phases: [] });
  });

  it('un descuento del 100 % deja solo el laboratorio', () => {
    expect(calculateBudget(lines, 100).totalCents).toBe(11_000);
  });
});

describe('aprobación parcial (RF-08)', () => {
  const lines = [line('a', 1, 10_000, 1_000), line('b', 1, 20_000), line('c', 2, 30_000, 5_000)];

  it('el importe aprobado solo incluye los ítems elegidos, con el mismo descuento', () => {
    expect(approvedTotal(lines, new Set(['a']), 0)).toBe(11_000);
    expect(approvedTotal(lines, new Set(['a', 'c']), 10)).toBe(10_000 - 1_000 + 1_000 + 30_000 - 3_000 + 5_000);
    expect(approvedTotal(lines, new Set(), 10)).toBe(0);
  });

  it('aprobar todo equivale al total del presupuesto', () => {
    const all = new Set(['a', 'b', 'c']);
    expect(approvedTotal(lines, all, 15)).toBe(calculateBudget(lines, 15).totalCents);
  });
});

describe('autorización de descuentos', () => {
  it('solo exige autorización por encima del umbral', () => {
    expect(requiresDiscountAuthorization(10, 10)).toBe(false);
    expect(requiresDiscountAuthorization(10.01, 10)).toBe(true);
    expect(requiresDiscountAuthorization(0, 0)).toBe(false);
    expect(requiresDiscountAuthorization(5, 0)).toBe(true);
  });
});
