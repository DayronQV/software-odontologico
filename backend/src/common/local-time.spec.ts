import { formatLocalDateTime, formatLocalTime, localDateAsUtc, localParts } from './local-time';

const TZ = 'America/Bogota';

describe('hora local de la clínica', () => {
  it('convierte UTC a partes locales (UTC-5)', () => {
    // 2026-11-03T03:30Z = lunes 2 de noviembre, 22:30 en Bogotá
    expect(localParts(new Date('2026-11-03T03:30:00Z'), TZ)).toEqual({
      year: 2026,
      month: 11,
      day: 2,
      weekday: 1,
      minuteOfDay: 22 * 60 + 30,
    });
  });

  it('la medianoche local es minuto 0, no 1440', () => {
    expect(localParts(new Date('2026-11-03T05:00:00Z'), TZ).minuteOfDay).toBe(0);
  });

  it('localDateAsUtc devuelve la fecha de calendario local a medianoche UTC', () => {
    expect(localDateAsUtc(new Date('2026-11-03T03:30:00Z'), TZ).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(localDateAsUtc(new Date('2026-11-03T05:30:00Z'), TZ).toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('da formato legible en español', () => {
    const date = new Date('2026-11-02T15:30:00Z'); // 10:30 locales
    expect(formatLocalDateTime(date, TZ)).toMatch(/lunes, 2 de noviembre de 2026/i);
    expect(formatLocalDateTime(date, TZ)).toContain('10:30');
    expect(formatLocalTime(date, TZ)).toContain('10:30');
  });
});
