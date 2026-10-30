/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Campos sensibles que se guardan cifrados (AES-256-GCM) en PostgreSQL.
 * Se cifra al escribir y se descifra al leer, de forma transparente.
 * Limitaciones: no se puede filtrar (`where`) por estos campos, ni se descifran
 * relaciones anidadas (`include`); léelos desde su propio modelo.
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  User: ['documentId'],
  MfaSecret: ['secret'],
};

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
]);

function encryptRecord(record: any, fields: string[], crypto: CryptoService): void {
  if (!record || typeof record !== 'object') return;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string') {
      record[field] = crypto.isEncrypted(value) ? value : crypto.encrypt(value);
    } else if (value && typeof value === 'object' && typeof value.set === 'string') {
      value.set = crypto.isEncrypted(value.set) ? value.set : crypto.encrypt(value.set);
    }
  }
}

function decryptRecord(record: any, fields: string[], crypto: CryptoService): void {
  if (!record || typeof record !== 'object') return;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && crypto.isEncrypted(value)) {
      record[field] = crypto.decrypt(value);
    }
  }
}

export function encryptionExtension(crypto: CryptoService) {
  return Prisma.defineExtension({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const fields = ENCRYPTED_FIELDS[model];
          if (!fields) return query(args);

          if (WRITE_OPERATIONS.has(operation)) {
            const a = args as any;
            for (const key of ['data', 'create', 'update']) {
              const payload = a[key];
              if (Array.isArray(payload)) {
                payload.forEach((item) => encryptRecord(item, fields, crypto));
              } else {
                encryptRecord(payload, fields, crypto);
              }
            }
          }

          const result: any = await query(args);
          if (Array.isArray(result)) {
            result.forEach((row) => decryptRecord(row, fields, crypto));
          } else {
            decryptRecord(result, fields, crypto);
          }
          return result;
        },
      },
    },
  });
}
