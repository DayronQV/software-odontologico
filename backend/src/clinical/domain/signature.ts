import { createHash } from 'node:crypto';

/** SHA-256 en hexadecimal. */
export const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** JSON con las claves ordenadas: el mismo contenido siempre produce el mismo hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export interface SignedPayload {
  /** Tipo de documento firmado (NOTE, ADDENDUM…). */
  kind: string;
  entityId: string;
  /** Contenido firmado (texto o campos clínicos). */
  content: unknown;
  signerId: string;
  signedAt: Date;
}

/**
 * Firma digital del profesional (RF-05): sello de tiempo + SHA-256 del contenido canónico.
 * Cualquier cambio posterior al contenido, al firmante o a la fecha produce otro hash.
 */
export function signatureHash(payload: SignedPayload): string {
  return sha256(canonicalJson({ ...payload, signedAt: payload.signedAt.toISOString() }));
}

export function verifySignatureHash(expected: string | null, payload: SignedPayload): boolean {
  return !!expected && signatureHash(payload) === expected;
}
