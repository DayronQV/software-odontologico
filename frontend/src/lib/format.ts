const LOCALE = 'es';

export function formatMoney(value: number | string | null | undefined, currency = 'USD'): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const longDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

export const formatDate = (iso: string | Date) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string | Date) => dateTimeFormat.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeFormat.format(new Date(iso));
export const formatLongDate = (iso: string | Date) => longDateFormat.format(new Date(iso));

/** "2026-11-02" → "02 nov 2026" (fecha de calendario, sin desfase de zona horaria). */
export function formatCalendarDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → valor de <input type="datetime-local"> en hora local. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (hora local) → ISO UTC para la API. */
export const fromLocalInputValue = (value: string): string => new Date(value).toISOString();

/** Minutos desde las 00:00 → "HH:mm" (horarios laborales). */
export function minutesToClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "HH:mm" → minutos desde las 00:00. */
export function clockToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
