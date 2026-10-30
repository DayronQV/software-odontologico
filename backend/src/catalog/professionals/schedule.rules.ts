export interface ScheduleSlot {
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  /** Minutos desde las 00:00 (hora local de la clínica) */
  startMinute: number;
  endMinute: number;
}

/** Devuelve un mensaje de error si el horario es incoherente, o null si es válido. */
export function validateScheduleSlots(slots: ScheduleSlot[]): string | null {
  for (const slot of slots) {
    if (slot.endMinute <= slot.startMinute) {
      return 'La hora de fin debe ser posterior a la de inicio';
    }
  }
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const slot of slots) byDay.set(slot.weekday, [...(byDay.get(slot.weekday) ?? []), slot]);

  for (const daySlots of byDay.values()) {
    const sorted = [...daySlots].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        return 'Hay franjas horarias superpuestas en el mismo día';
      }
    }
  }
  return null;
}
