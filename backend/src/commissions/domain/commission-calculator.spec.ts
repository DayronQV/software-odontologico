import { calculateCommission, selectRule, type RuleLike } from './commission-calculator';

const rule = (overrides: Partial<RuleLike> = {}): RuleLike => ({
  id: 'r',
  procedureId: null,
  mode: 'PERCENT',
  value: 40,
  validFrom: new Date('2026-01-01'),
  validTo: null,
  priority: 0,
  active: true,
  ...overrides,
});

describe('comisiones: las tres modalidades (RF-13)', () => {
  const base = { baseCents: 10_000, labCents: 2_000, materialsCents: 500, quantity: 1 }; // 100,00 cobrado; lab 20,00; materiales 5,00

  it('porcentaje fijo sobre el valor cobrado', () => {
    expect(calculateCommission({ ...base, mode: 'PERCENT', value: 40 })).toEqual({ calculationBaseCents: 10_000, commissionCents: 4_000 });
    expect(calculateCommission({ ...base, mode: 'PERCENT', value: 12.5 }).commissionCents).toBe(1_250);
    expect(calculateCommission({ ...base, mode: 'PERCENT', value: 0 }).commissionCents).toBe(0);
  });

  it('monto fijo por procedimiento (por cada unidad)', () => {
    expect(calculateCommission({ ...base, mode: 'FIXED_AMOUNT', value: 8 }).commissionCents).toBe(800);
    expect(calculateCommission({ ...base, mode: 'FIXED_AMOUNT', value: 8, quantity: 3 }).commissionCents).toBe(2_400);
  });

  it('porcentaje tras deducir laboratorio y materiales', () => {
    // base = 100 − 20 − 5 = 75 → 50 % = 37,50
    expect(calculateCommission({ ...base, mode: 'PERCENT_NET_OF_COSTS', value: 50 })).toEqual({ calculationBaseCents: 7_500, commissionCents: 3_750 });
  });

  it('casos límite: costos mayores al precio no dan comisión negativa', () => {
    const result = calculateCommission({ mode: 'PERCENT_NET_OF_COSTS', value: 50, baseCents: 1_000, labCents: 5_000, materialsCents: 500, quantity: 1 });
    expect(result).toEqual({ calculationBaseCents: 0, commissionCents: 0 });
  });

  it('con descuento el porcentaje se calcula sobre lo realmente cobrado', () => {
    // 100 con 10 % de descuento = 90 cobrados → 40 % = 36
    expect(calculateCommission({ ...base, baseCents: 9_000, mode: 'PERCENT', value: 40 }).commissionCents).toBe(3_600);
  });

  it('redondea al centavo y no acumula errores de coma flotante', () => {
    expect(calculateCommission({ mode: 'PERCENT', value: 33.33, baseCents: 1_001, labCents: 0, materialsCents: 0, quantity: 1 }).commissionCents).toBe(334);
    expect(Number.isInteger(calculateCommission({ ...base, mode: 'PERCENT', value: 7.77 }).commissionCents)).toBe(true);
  });

  it('un valor cobrado negativo (nota de crédito) no genera comisión', () => {
    expect(calculateCommission({ ...base, baseCents: -500, mode: 'PERCENT', value: 40 }).commissionCents).toBe(0);
  });
});

describe('selección de la regla vigente', () => {
  const at = new Date('2026-06-15T12:00:00Z');

  it('ignora reglas inactivas, futuras o vencidas', () => {
    const rules = [rule({ id: 'off', active: false }), rule({ id: 'future', validFrom: new Date('2026-09-01') }), rule({ id: 'old', validFrom: new Date('2025-01-01'), validTo: new Date('2026-03-31') })];
    expect(selectRule(rules, 'p1', at)).toBeNull();
  });

  it('la vigencia incluye el último día', () => {
    expect(selectRule([rule({ id: 'ends', validTo: new Date('2026-06-15') })], 'p1', at)?.id).toBe('ends');
  });

  it('gana la mayor prioridad', () => {
    const rules = [rule({ id: 'low', priority: 1 }), rule({ id: 'high', priority: 5 })];
    expect(selectRule(rules, 'p1', at)?.id).toBe('high');
  });

  it('con igual prioridad, la regla del procedimiento gana a la general', () => {
    const rules = [rule({ id: 'general' }), rule({ id: 'specific', procedureId: 'p1' })];
    expect(selectRule(rules, 'p1', at)?.id).toBe('specific');
    expect(selectRule(rules, 'otro', at)?.id).toBe('general'); // la específica no aplica a otro procedimiento
  });

  it('con todo igual, gana la de vigencia más reciente', () => {
    const rules = [rule({ id: 'older', validFrom: new Date('2026-01-01') }), rule({ id: 'newer', validFrom: new Date('2026-05-01') })];
    expect(selectRule(rules, 'p1', at)?.id).toBe('newer');
  });
});
