export const ADULT_AGE = 18;

/** Edad cumplida en años a la fecha `today` (ambas como fechas de calendario en UTC). */
export function calculateAge(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/** Menor de edad: requiere tutor legal (RF-01). */
export function isMinor(birthDate: Date, today: Date): boolean {
  return calculateAge(birthDate, today) < ADULT_AGE;
}

/** "2010-05-17" → Date UTC a medianoche. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);
