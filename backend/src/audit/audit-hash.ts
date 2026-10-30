import { createHash } from 'node:crypto';

/** Hash previo del primer registro de la cadena. */
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditHashInput {
  timestamp: string; // ISO-8601
  userId: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
}

/** JSON con claves ordenadas: estable aunque PostgreSQL reordene las claves de un jsonb. */
export function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** hash = SHA-256( prevHash | contenido canónico ): cada registro encadena al anterior. */
export function computeAuditHash(prevHash: string, input: AuditHashInput): string {
  const body = canonicalize({
    timestamp: input.timestamp,
    userId: input.userId ?? null,
    role: input.role ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  });
  return createHash('sha256').update(`${prevHash}|${body}`).digest('hex');
}
