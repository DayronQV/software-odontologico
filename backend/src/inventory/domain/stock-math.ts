/** Cantidades con 3 decimales (gramos, mililitros…): se redondea para evitar ruido de coma flotante. */
export const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export interface Available {
  locationId: string;
  available: number;
}

export interface Allocation {
  locationId: string;
  quantity: number;
}

/**
 * Reparte lo que se necesita entre las ubicaciones en orden de prioridad (profesional primero, luego
 * consultorio), usando solo lo disponible. Devuelve lo asignado y lo que faltó.
 */
export function allocateConsumption(needed: number, sources: Available[]): { allocations: Allocation[]; shortage: number } {
  let remaining = round3(needed);
  const allocations: Allocation[] = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const take = round3(Math.min(remaining, Math.max(0, source.available)));
    if (take > 0) {
      allocations.push({ locationId: source.locationId, quantity: take });
      remaining = round3(remaining - take);
    }
  }
  return { allocations, shortage: remaining };
}

/** Un insumo está bajo mínimo cuando su existencia es menor al mínimo configurado. */
export const isBelowMinimum = (quantity: number, minStock: number): boolean => minStock > 0 && quantity < minStock;

export type ExpiryState = 'EXPIRED' | 'EXPIRING';

/** Vencido o por vencer dentro de `alertDays`; `null` si todavía está lejos. */
export function expiryState(expiresAt: Date, today: Date, alertDays: number): ExpiryState | null {
  const day = 86_400_000;
  const left = Math.floor((expiresAt.getTime() - today.getTime()) / day);
  if (left < 0) return 'EXPIRED';
  return left <= alertDays ? 'EXPIRING' : null;
}
