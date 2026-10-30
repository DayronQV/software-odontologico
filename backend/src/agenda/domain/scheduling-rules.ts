import { localParts } from '../../common/local-time';

export interface ScheduleSlot {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ClinicHours {
  opensAtMinute: number;
  closesAtMinute: number;
}

export type WorkingHoursCheck = { ok: true } | { ok: false; reason: string };

/** Dos intervalos [inicio, fin) se solapan si cada uno empieza antes de que termine el otro. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function minutesToClock(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * La cita debe caber completa en el horario de la clínica y en una franja del horario laboral
 * del profesional para ese día de la semana (hora local de la clínica).
 */
export function fitsWorkingHours(
  start: Date,
  end: Date,
  timeZone: string,
  professionalSlots: ScheduleSlot[],
  clinic: ClinicHours,
): WorkingHoursCheck {
  const s = localParts(start, timeZone);
  const e = localParts(end, timeZone);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  if (!sameDay) return { ok: false, reason: 'La cita no puede cruzar la medianoche' };

  if (s.minuteOfDay < clinic.opensAtMinute || e.minuteOfDay > clinic.closesAtMinute) {
    return {
      ok: false,
      reason: `Fuera del horario de la clínica (${minutesToClock(clinic.opensAtMinute)} a ${minutesToClock(clinic.closesAtMinute)})`,
    };
  }
  if (professionalSlots.length === 0) {
    return { ok: false, reason: 'El profesional no tiene un horario laboral configurado' };
  }
  const fits = professionalSlots.some(
    (slot) =>
      slot.weekday === s.weekday &&
      s.minuteOfDay >= slot.startMinute &&
      e.minuteOfDay <= slot.endMinute,
  );
  return fits ? { ok: true } : { ok: false, reason: 'Fuera del horario laboral del profesional' };
}
