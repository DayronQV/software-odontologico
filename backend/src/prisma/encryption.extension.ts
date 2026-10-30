/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Campos sensibles que se guardan cifrados (AES-256-GCM) en PostgreSQL. Se cifra al escribir y se
 * descifra al leer, de forma transparente (incluidas listas de texto y relaciones con `include`).
 *
 * Limitación: no se puede filtrar (`where`) por estos campos. Para buscar por documento se usa un
 * índice ciego (`Patient.documentHash`, HMAC del documento normalizado).
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  User: ['documentId'],
  MfaSecret: ['secret'],
  Patient: ['documentId'],
  Guardian: ['documentId'],
  MedicalHistory: [
    'systemicDiseases',
    'drugAllergies',
    'coagulopathies',
    'surgicalHistory',
    'currentMedication',
  ],
  // Fase 2: texto clínico libre
  EvolutionNote: ['subjective', 'objective', 'assessment', 'plan'],
  ClinicalAddendum: ['content'],
  ProcedureRecord: ['notes'],
  VitalSigns: ['notes'],
  OdontogramFinding: ['notes'],
  PerioChart: ['notes'],
  Prescription: ['diagnosis', 'notes'],
  PatientConsent: ['renderedText'],
};

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
]);

function encryptValue(value: unknown, crypto: CryptoService): unknown {
  if (typeof value === 'string') return crypto.isEncrypted(value) ? value : crypto.encrypt(value);
  if (Array.isArray(value)) return value.map((item) => encryptValue(item, crypto));
  return value;
}

function encryptRecord(record: any, fields: string[], crypto: CryptoService): void {
  if (!record || typeof record !== 'object') return;
  for (const field of fields) {
    const value = record[field];
    if (value && typeof value === 'object' && !Array.isArray(value) && 'set' in value) {
      value.set = encryptValue(value.set, crypto); // formato { set: ... } de Prisma
    } else if (value !== undefined) {
      record[field] = encryptValue(value, crypto);
    }
  }
}

/** Recorre el resultado completo y descifra cualquier valor con el prefijo de cifrado. */
function decryptDeep(node: any, crypto: CryptoService): any {
  if (typeof node === 'string') {
    if (!crypto.isEncrypted(node)) return node;
    try {
      return crypto.decrypt(node);
    } catch {
      return node; // valor corrupto o con otra clave: no se rompe la lectura completa
    }
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = decryptDeep(node[i], crypto);
    return node;
  }
  if (node && typeof node === 'object' && Object.getPrototypeOf(node) === Object.prototype) {
    for (const key of Object.keys(node)) node[key] = decryptDeep(node[key], crypto);
  }
  return node;
}

export function encryptionExtension(crypto: CryptoService) {
  return Prisma.defineExtension({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const fields = ENCRYPTED_FIELDS[model];
          if (fields && WRITE_OPERATIONS.has(operation)) {
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
          return decryptDeep(await query(args), crypto);
        },
      },
    },
  });
}
