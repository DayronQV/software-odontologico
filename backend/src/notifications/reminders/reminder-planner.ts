export interface PlannedReminder {
  /** Antelación respecto al inicio de la cita. */
  leadHours: number;
  runAt: Date;
}

const HOUR_MS = 60 * 60_000;

/**
 * Recordatorios a enviar para una cita (RF-11: 48 h y 24 h antes, configurable). Los que ya
 * quedaron en el pasado se descartan: una cita para dentro de 30 h solo recibe el de 24 h.
 */
export function planReminders(startAt: Date, now: Date, leadHours: number[]): PlannedReminder[] {
  return [...new Set(leadHours)]
    .sort((a, b) => b - a)
    .map((hours) => ({ leadHours: hours, runAt: new Date(startAt.getTime() - hours * HOUR_MS) }))
    .filter((reminder) => reminder.runAt.getTime() > now.getTime());
}
