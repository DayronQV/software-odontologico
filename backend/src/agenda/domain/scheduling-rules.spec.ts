import { fitsWorkingHours, minutesToClock, rangesOverlap, type ScheduleSlot } from './scheduling-rules';

const TZ = 'America/Bogota'; // UTC-5 todo el año
const CLINIC = { opensAtMinute: 7 * 60, closesAtMinute: 21 * 60 };
/** Lunes a viernes 08:00–18:00 */
const WEEKDAYS: ScheduleSlot[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1080 }));

// Lunes 2026-11-02 a las `hh:mm` hora de Bogotá
const at = (day: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, day, hh + 5, mm));

describe('rangesOverlap', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  it('detecta solapamientos parciales y totales', () => {
    expect(rangesOverlap(t(9), t(10), t(9), t(10))).toBe(true);
    expect(rangesOverlap(t(9), t(11), t(10), t(12))).toBe(true);
    expect(rangesOverlap(t(9), t(12), t(10), t(11))).toBe(true);
  });
  it('citas contiguas NO se solapan', () => {
    expect(rangesOverlap(t(9), t(10), t(10), t(11))).toBe(false);
    expect(rangesOverlap(t(10), t(11), t(9), t(10))).toBe(false);
  });
});

describe('fitsWorkingHours', () => {
  it('acepta una cita dentro del horario del profesional y de la clínica', () => {
    expect(fitsWorkingHours(at(2, 10), at(2, 11), TZ, WEEKDAYS, CLINIC)).toEqual({ ok: true });
    expect(fitsWorkingHours(at(2, 8), at(2, 18), TZ, WEEKDAYS, CLINIC)).toEqual({ ok: true }); // exacto
  });

  it('rechaza antes o después del horario del profesional', () => {
    const early = fitsWorkingHours(at(2, 7, 30), at(2, 8, 30), TZ, WEEKDAYS, CLINIC);
    expect(early).toMatchObject({ ok: false, reason: expect.stringContaining('profesional') });
    const late = fitsWorkingHours(at(2, 17, 30), at(2, 18, 30), TZ, WEEKDAYS, CLINIC);
    expect(late.ok).toBe(false);
  });

  it('rechaza un día en que el profesional no trabaja (domingo 2026-11-08)', () => {
    expect(fitsWorkingHours(at(8, 10), at(8, 11), TZ, WEEKDAYS, CLINIC)).toMatchObject({ ok: false });
  });

  it('rechaza fuera del horario de la clínica aunque el profesional lo tenga', () => {
    const wide: ScheduleSlot[] = [{ weekday: 1, startMinute: 0, endMinute: 1440 }];
    const result = fitsWorkingHours(at(2, 6), at(2, 7), TZ, wide, CLINIC);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('07:00 a 21:00') });
    expect(fitsWorkingHours(at(2, 20, 30), at(2, 21, 30), TZ, wide, CLINIC).ok).toBe(false);
  });

  it('rechaza si el profesional no tiene horario configurado', () => {
    expect(fitsWorkingHours(at(2, 10), at(2, 11), TZ, [], CLINIC)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('no tiene un horario'),
    });
  });

  it('usa la hora LOCAL de la clínica, no la UTC', () => {
    // 23:00 hora de Bogotá del lunes = 04:00 UTC del martes: sigue siendo lunes local
    const wide: ScheduleSlot[] = [{ weekday: 1, startMinute: 0, endMinute: 1440 }];
    const lateClinic = { opensAtMinute: 0, closesAtMinute: 1440 };
    expect(fitsWorkingHours(at(2, 23), at(2, 23, 30), TZ, wide, lateClinic)).toEqual({ ok: true });
  });

  it('rechaza citas que cruzan la medianoche', () => {
    const wide: ScheduleSlot[] = [1, 2].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
    const result = fitsWorkingHours(at(2, 23, 30), at(3, 0, 30), TZ, wide, { opensAtMinute: 0, closesAtMinute: 1440 });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('medianoche') });
  });
});

describe('minutesToClock', () => {
  it('formatea minutos como HH:mm', () => {
    expect(minutesToClock(420)).toBe('07:00');
    expect(minutesToClock(1260)).toBe('21:00');
    expect(minutesToClock(75)).toBe('01:15');
  });
});
