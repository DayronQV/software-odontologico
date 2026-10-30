/**
 * Límite estricto para login y MFA (fuerza bruta). Se lee al cargar el módulo,
 * porque los decoradores necesitan valores estáticos.
 */
export const AUTH_THROTTLE = {
  limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
  ttl: Number(process.env.THROTTLE_AUTH_TTL_SECONDS ?? 60) * 1000,
};

/** Límite general de la API (por IP). */
export const DEFAULT_THROTTLE = { limit: 600, ttl: 60_000 };
