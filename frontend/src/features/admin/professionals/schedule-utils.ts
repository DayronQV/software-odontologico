import { minutesToClock } from '../../../lib/format';
import type { ScheduleSlot } from '../../catalog/types';

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** Orden de la semana laboral: lunes a domingo. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "Lun–Vie 08:00–18:00 · Sáb 08:00–13:00": resumen legible del horario semanal. */
export function summarizeSchedule(slots: ScheduleSlot[]): string {
  if (slots.length === 0) return 'Sin horario';
  const byRange = new Map<string, number[]>();
  for (const slot of [...slots].sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.startMinute - b.startMinute)) {
    const key = `${minutesToClock(slot.startMinute)}–${minutesToClock(slot.endMinute)}`;
    byRange.set(key, [...(byRange.get(key) ?? []), slot.weekday]);
  }
  return [...byRange.entries()]
    .map(([range, days]) => `${formatDays(days)} ${range}`)
    .join(' · ');
}

/** [1,2,3,4,5] → "Lun–Vie"; [1,3,5] → "Lun, Mié, Vie". */
function formatDays(days: number[]): string {
  const ordered = [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  const consecutive = ordered.every((d, i) => i === 0 || WEEK_ORDER.indexOf(d) === WEEK_ORDER.indexOf(ordered[i - 1]) + 1);
  if (ordered.length >= 3 && consecutive) return `${SHORT[ordered[0]]}–${SHORT[ordered[ordered.length - 1]]}`;
  return ordered.map((d) => SHORT[d]).join(', ');
}
