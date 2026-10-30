import { validateScheduleSlots } from './schedule.rules';

const slot = (weekday: number, startMinute: number, endMinute: number) => ({ weekday, startMinute, endMinute });

describe('validación del horario semanal', () => {
  it('acepta franjas separadas, incluso partidas en el mismo día', () => {
    expect(validateScheduleSlots([slot(1, 480, 720), slot(1, 840, 1080), slot(2, 480, 1080)])).toBeNull();
  });

  it('acepta franjas contiguas', () => {
    expect(validateScheduleSlots([slot(1, 480, 720), slot(1, 720, 1080)])).toBeNull();
  });

  it('rechaza fin anterior o igual al inicio', () => {
    expect(validateScheduleSlots([slot(1, 600, 600)])).toContain('posterior');
    expect(validateScheduleSlots([slot(1, 700, 600)])).toContain('posterior');
  });

  it('rechaza franjas superpuestas el mismo día', () => {
    expect(validateScheduleSlots([slot(3, 480, 780), slot(3, 720, 1080)])).toContain('superpuestas');
  });

  it('franjas iguales en días distintos no se consideran superpuestas', () => {
    expect(validateScheduleSlots([slot(1, 480, 780), slot(2, 480, 780)])).toBeNull();
  });

  it('un horario vacío es válido (se puede configurar después)', () => {
    expect(validateScheduleSlots([])).toBeNull();
  });
});
