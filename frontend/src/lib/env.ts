/**
 * Cierre de sesión por inactividad (RNF-05c): 15 minutos como máximo.
 * VITE_IDLE_MINUTES permite acortarlo (p. ej. para pruebas), nunca ampliarlo.
 */
const MAX_IDLE_MINUTES = 15;

export function resolveIdleMinutes(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) return MAX_IDLE_MINUTES;
  return Math.min(parsed, MAX_IDLE_MINUTES);
}

export const IDLE_TIMEOUT_MS = resolveIdleMinutes(import.meta.env.VITE_IDLE_MINUTES) * 60_000;
/** Aviso previo al cierre: 1 minuto (o la mitad del plazo si este es muy corto). */
export const IDLE_WARNING_MS = Math.min(60_000, IDLE_TIMEOUT_MS / 2);
/** Cada cuánto se avisa al servidor que el usuario sigue activo. */
export const KEEPALIVE_MS = Math.min(4 * 60_000, IDLE_TIMEOUT_MS / 3);
