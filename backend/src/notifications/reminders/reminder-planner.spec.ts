import { planReminders } from './reminder-planner';

const HOUR = 60 * 60_000;
const start = new Date('2026-11-10T15:00:00Z');

describe('planificador de recordatorios (RF-11: 48 h y 24 h)', () => {
  it('programa 48 h y 24 h antes de la cita', () => {
    const now = new Date(start.getTime() - 5 * 24 * HOUR);
    const plan = planReminders(start, now, [48, 24]);
    expect(plan.map((p) => p.leadHours)).toEqual([48, 24]);
    expect(plan[0].runAt.toISOString()).toBe('2026-11-08T15:00:00.000Z');
    expect(plan[1].runAt.toISOString()).toBe('2026-11-09T15:00:00.000Z');
  });

  it('descarta los recordatorios que ya quedaron en el pasado', () => {
    const now = new Date(start.getTime() - 30 * HOUR); // faltan 30 h
    expect(planReminders(start, now, [48, 24]).map((p) => p.leadHours)).toEqual([24]);
  });

  it('una cita para dentro de menos de 24 h no recibe recordatorios', () => {
    expect(planReminders(start, new Date(start.getTime() - 10 * HOUR), [48, 24])).toEqual([]);
  });

  it('respeta las horas configuradas, sin duplicados y ordenadas de mayor a menor', () => {
    const now = new Date(start.getTime() - 200 * HOUR);
    expect(planReminders(start, now, [2, 72, 24, 24]).map((p) => p.leadHours)).toEqual([72, 24, 2]);
  });

  it('sin horas configuradas no hay recordatorios', () => {
    expect(planReminders(start, new Date(0), [])).toEqual([]);
  });
});
