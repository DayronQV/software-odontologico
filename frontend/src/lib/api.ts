/**
 * Cliente HTTP: agrega el JWT, renueva el token automáticamente al expirar (una sola
 * renovación a la vez) y unifica los errores. El access token vive solo en memoria;
 * el refresh token en sessionStorage (se borra al cerrar la pestaña).
 */
export class ApiError extends Error {
  readonly status: number;
  /** Datos estructurados que acompañan al error (p. ej. las alertas de alergia de una receta). */
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const REFRESH_KEY = 'sigo.refresh';
let accessToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

function readRefresh(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export const tokens = {
  get access(): string | null {
    return accessToken;
  },
  get refresh(): string | null {
    return readRefresh();
  },
  set(pair: { accessToken: string; refreshToken: string }): void {
    accessToken = pair.accessToken;
    try {
      sessionStorage.setItem(REFRESH_KEY, pair.refreshToken);
    } catch {
      /* almacenamiento no disponible: la sesión no sobrevivirá a una recarga */
    }
  },
  clear(): void {
    accessToken = null;
    try {
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* nada que limpiar */
    }
  },
};

/** Se invoca cuando la sesión ya no se puede recuperar (token vencido sin refresh válido). */
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** Mensajes del backend que significan "su sesión ya no es válida" (y no un error de datos). */
const SESSION_ERROR = /^(Sesión expirada|Token (requerido|inválido)|Usuario inactivo)/;

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('. ');
  return typeof message === 'string' ? message : null;
}

function extractDetails(body: unknown): unknown {
  return body && typeof body === 'object' ? (body as { details?: unknown }).details : undefined;
}

/** Renueva el par de tokens. Varias llamadas simultáneas comparten una sola petición. */
export function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      tokens.set(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Subida de archivos (multipart): el navegador define el Content-Type con su límite. */
  formData?: FormData;
  /** false para endpoints públicos (login): no envía token ni intenta renovar. */
  auth?: boolean;
}

/** Envía la petición con el JWT; si el token expiró lo renueva una vez y reintenta. */
async function request(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, formData, auth = true } = options;

  const send = () =>
    fetch(`/api${path}`, {
      method,
      headers: {
        ...(formData ? {} : { 'Content-Type': 'application/json' }),
        ...(auth && tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
      },
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });

  let res = await send();

  if (res.status === 401 && auth) {
    const message = extractMessage(await res.clone().json().catch(() => null)) ?? '';
    if (SESSION_ERROR.test(message)) {
      if (await refreshTokens()) {
        res = await send();
      }
      if (res.status === 401) {
        const again = extractMessage(await res.clone().json().catch(() => null)) ?? '';
        if (SESSION_ERROR.test(again)) {
          tokens.clear();
          sessionExpiredHandler?.();
        }
      }
    }
  }

  return res;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, extractMessage(data) ?? res.statusText, extractDetails(data));
  return data as T;
}

/** Descarga un archivo (p. ej. el PDF de un comprobante) con la sesión actual. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await request(path, {});
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, extractMessage(data) ?? res.statusText);
  }
  return res.blob();
}
