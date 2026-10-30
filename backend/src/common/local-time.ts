/**
 * Utilidades de hora local de la clínica. Las fechas se guardan en UTC; las reglas de negocio
 * (horario laboral, edad, recordatorios) se evalúan en la zona horaria configurada en la clínica.
 */
export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  /** Minutos transcurridos desde las 00:00 locales */
  minuteOfDay: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minuteOfDay: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** La fecha de calendario local de `date`, como medianoche UTC (para comparar con columnas `@db.Date`). */
export function localDateAsUtc(date: Date, timeZone: string): Date {
  const { year, month, day } = localParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Ejemplo: "martes 3 de noviembre de 2026, 10:30". */
export function formatLocalDateTime(date: Date, timeZone: string, locale = 'es'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

export function formatLocalTime(date: Date, timeZone: string, locale = 'es'): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
}
