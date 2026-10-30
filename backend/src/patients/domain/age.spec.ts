import { calculateAge, formatDateOnly, isMinor, parseDateOnly } from './age';

const d = (iso: string) => parseDateOnly(iso);

describe('edad y mayoría de edad (RF-01)', () => {
  it('calcula años cumplidos', () => {
    expect(calculateAge(d('2000-06-15'), d('2026-06-14'))).toBe(25); // un día antes del cumpleaños
    expect(calculateAge(d('2000-06-15'), d('2026-06-15'))).toBe(26); // el día del cumpleaños
    expect(calculateAge(d('2000-06-15'), d('2026-12-31'))).toBe(26);
    expect(calculateAge(d('2026-01-01'), d('2026-06-01'))).toBe(0);
  });

  it('es menor hasta el día anterior a cumplir 18', () => {
    expect(isMinor(d('2008-11-03'), d('2026-11-02'))).toBe(true);
    expect(isMinor(d('2008-11-03'), d('2026-11-03'))).toBe(false);
  });

  it('maneja el 29 de febrero', () => {
    expect(calculateAge(d('2008-02-29'), d('2026-02-28'))).toBe(17);
    expect(calculateAge(d('2008-02-29'), d('2026-03-01'))).toBe(18);
  });

  it('parsea y formatea fechas sin desfase de zona horaria', () => {
    expect(formatDateOnly(parseDateOnly('2010-05-17'))).toBe('2010-05-17');
    expect(formatDateOnly(parseDateOnly('2010-05-17T23:59:59-05:00'))).toBe('2010-05-17');
  });
});
