import { allocateConsumption, expiryState, isBelowMinimum, round3 } from './stock-math';

describe('descargo de insumos: reparto entre ubicaciones (RF-14)', () => {
  const sources = [
    { locationId: 'profesional', available: 2 },
    { locationId: 'consultorio', available: 10 },
  ];

  it('descuenta primero del profesional y completa con el consultorio', () => {
    expect(allocateConsumption(5, sources)).toEqual({
      allocations: [{ locationId: 'profesional', quantity: 2 }, { locationId: 'consultorio', quantity: 3 }],
      shortage: 0,
    });
  });

  it('si alcanza en la primera ubicación no toca la segunda', () => {
    expect(allocateConsumption(1.5, sources)).toEqual({ allocations: [{ locationId: 'profesional', quantity: 1.5 }], shortage: 0 });
  });

  it('informa el faltante cuando no hay stock suficiente', () => {
    expect(allocateConsumption(15, sources)).toEqual({
      allocations: [{ locationId: 'profesional', quantity: 2 }, { locationId: 'consultorio', quantity: 10 }],
      shortage: 3,
    });
    expect(allocateConsumption(4, [{ locationId: 'a', available: 0 }, { locationId: 'b', available: -2 }]).shortage).toBe(4);
  });

  it('trabaja con decimales sin ruido de coma flotante', () => {
    expect(allocateConsumption(0.3, [{ locationId: 'a', available: 0.1 }, { locationId: 'b', available: 0.2 }])).toEqual({
      allocations: [{ locationId: 'a', quantity: 0.1 }, { locationId: 'b', quantity: 0.2 }],
      shortage: 0,
    });
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});

describe('alertas de inventario', () => {
  it('stock mínimo', () => {
    expect(isBelowMinimum(4, 5)).toBe(true);
    expect(isBelowMinimum(5, 5)).toBe(false);
    expect(isBelowMinimum(0, 0)).toBe(false); // sin mínimo configurado no alerta
  });

  it('vencimiento: vencido, por vencer (dentro del plazo) o lejano', () => {
    const today = new Date('2026-11-02T10:00:00Z');
    expect(expiryState(new Date('2026-10-30T00:00:00Z'), today, 30)).toBe('EXPIRED');
    expect(expiryState(new Date('2026-11-20T00:00:00Z'), today, 30)).toBe('EXPIRING');
    expect(expiryState(new Date('2027-03-01T00:00:00Z'), today, 30)).toBeNull();
  });
});
