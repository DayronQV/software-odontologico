import { describe, expect, it } from 'vitest';
import { formatWaiting, isReleased, STATUS_META, STATUS_ORDER } from './appointment-status';
import { buildAppointmentPayload, suggestedDuration, validateAppointmentForm, type AppointmentFormValues } from './form/appointment-form';
import { summarizeSchedule } from '../admin/professionals/schedule-utils';

const NOW = new Date(2026, 10, 2, 9, 0);
const valid: AppointmentFormValues = {
  patientId: 'p1', professionalId: 'd1', chairId: 'c1', procedureIds: ['x'], start: '2026-11-03T10:00', durationMinutes: 45, notes: '',
};

describe('estados de la cita (RF-10)', () => {
  it('define los 7 estados con etiqueta y colores', () => {
    expect(STATUS_ORDER).toHaveLength(7);
    expect(STATUS_ORDER.map((s) => STATUS_META[s].label)).toEqual([
      'Programado', 'Confirmado', 'En sala de espera', 'En atención', 'Atendido', 'Cancelado', 'No asistió',
    ]);
    for (const status of STATUS_ORDER) expect(STATUS_META[status].event.background).toMatch(/^#/);
  });

  it('solo canceladas y sin asistencia liberan el horario', () => {
    expect(STATUS_ORDER.filter(isReleased)).toEqual(['CANCELED', 'NO_SHOW']);
  });

  it('describe cuánto lleva esperando un paciente', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    expect(formatWaiting('2026-11-02T11:59:40Z', now)).toBe('recién llegó');
    expect(formatWaiting('2026-11-02T11:48:00Z', now)).toBe('hace 12 min');
    expect(formatWaiting('2026-11-02T10:30:00Z', now)).toBe('hace 1 h 30 min');
  });
});

describe('formulario de cita (RF-09)', () => {
  it('acepta datos completos', () => {
    expect(validateAppointmentForm(valid, NOW)).toEqual({});
  });

  it('exige paciente, profesional, sillón, procedimiento y hora', () => {
    const errors = validateAppointmentForm({ ...valid, patientId: '', professionalId: '', chairId: '', procedureIds: [], start: '' }, NOW);
    expect(Object.keys(errors).sort()).toEqual(['chairId', 'patientId', 'procedureIds', 'professionalId', 'start']);
  });

  it('rechaza el pasado y duraciones absurdas', () => {
    expect(validateAppointmentForm({ ...valid, start: '2026-11-01T10:00' }, NOW).start).toContain('pasado');
    expect(validateAppointmentForm({ ...valid, durationMinutes: 2 }, NOW).durationMinutes).toBeDefined();
    expect(validateAppointmentForm({ ...valid, durationMinutes: 600 }, NOW).durationMinutes).toBeDefined();
  });

  it('calcula el fin con la duración y limpia las notas', () => {
    const payload = buildAppointmentPayload({ ...valid, notes: '  control  ' });
    expect(new Date(payload.endAt).getTime() - new Date(payload.startAt).getTime()).toBe(45 * 60_000);
    expect(payload).toMatchObject({ patientId: 'p1', chairId: 'c1', notes: 'control' });
    expect(buildAppointmentPayload(valid).notes).toBeUndefined();
  });

  it('sugiere la duración sumando los procedimientos elegidos', () => {
    const procedures = [{ id: 'a', durationMinutes: 30 }, { id: 'b', durationMinutes: 45 }, { id: 'c', durationMinutes: 60 }];
    expect(suggestedDuration(procedures, ['a', 'b'])).toBe(75);
    expect(suggestedDuration(procedures, [])).toBe(30);
  });
});

describe('resumen del horario laboral', () => {
  const slot = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });
  it('agrupa días consecutivos con el mismo horario', () => {
    const weekdays = [1, 2, 3, 4, 5].map((d) => slot(d, 480, 1080));
    expect(summarizeSchedule([...weekdays, slot(6, 480, 780)])).toBe('Lun–Vie 08:00–18:00 · Sáb 08:00–13:00');
  });
  it('lista días salteados y maneja el horario vacío', () => {
    expect(summarizeSchedule([1, 3, 5].map((d) => slot(d, 540, 1020)))).toBe('Lun, Mié, Vie 09:00–17:00');
    expect(summarizeSchedule([])).toBe('Sin horario');
  });
});
