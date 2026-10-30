import { describe, expect, it } from 'vitest';
import {
  clockToMinutes,
  formatCalendarDate,
  formatMoney,
  fromLocalInputValue,
  initials,
  minutesToClock,
  toLocalInputValue,
} from './format';

describe('formato', () => {
  it('da formato de moneda con la divisa de la clínica', () => {
    expect(formatMoney(1234.5, 'USD')).toMatch(/1\.?234,50|1,234\.50/);
    expect(formatMoney('12', 'USD')).toContain('12');
    expect(formatMoney(null)).toContain('0');
    expect(formatMoney(Number.NaN)).toContain('0');
  });

  it('convierte minutos ↔ reloj', () => {
    expect(minutesToClock(420)).toBe('07:00');
    expect(minutesToClock(1260)).toBe('21:00');
    expect(clockToMinutes('08:30')).toBe(510);
    expect(clockToMinutes(minutesToClock(75))).toBe(75);
  });

  it('las fechas de calendario no se desfasan por zona horaria', () => {
    expect(formatCalendarDate('2026-11-02')).toContain('2026');
    expect(formatCalendarDate('2026-11-02')).toMatch(/0?2/);
  });

  it('datetime-local ↔ ISO conserva el instante', () => {
    const date = new Date(2026, 10, 2, 10, 30);
    const local = toLocalInputValue(date);
    expect(local).toBe('2026-11-02T10:30');
    expect(new Date(fromLocalInputValue(local)).getTime()).toBe(date.getTime());
  });

  it('iniciales de un nombre', () => {
    expect(initials('Carlos Mendoza')).toBe('CM');
    expect(initials('  ana  ')).toBe('A');
    expect(initials('María del Carmen Pérez')).toBe('MD');
  });
});
