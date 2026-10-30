/** Plazo de edición de las notas de evolución (RF-05): 24 h por defecto, configurable. */
export const DEFAULT_NOTE_LOCK_HOURS = 24;

export function computeLockAt(createdAt: Date, lockHours: number): Date {
  return new Date(createdAt.getTime() + lockHours * 3_600_000);
}

/** Una nota se bloquea al cumplirse el plazo (`lockAt` incluido). */
export function isNoteLocked(note: { lockAt: Date }, now: Date = new Date()): boolean {
  return now.getTime() >= note.lockAt.getTime();
}
