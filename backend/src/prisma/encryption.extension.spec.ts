/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppConfigService } from '../config/app-config';
import { CryptoService } from '../crypto/crypto.service';
import { encryptionExtension } from './encryption.extension';

const crypto = new CryptoService({
  env: { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
} as AppConfigService);

// defineExtension devuelve `(client) => client.$extends(config)`: con un cliente falso se obtiene la config.
const extensionConfig = (encryptionExtension(crypto) as any)({ $extends: (config: unknown) => config });
const hook = extensionConfig.query.$allModels.$allOperations as (p: any) => Promise<any>;

describe('extensión de cifrado de Prisma', () => {
  it('cifra los campos sensibles al escribir y descifra el resultado', async () => {
    let seen: any;
    const result = await hook({
      model: 'User',
      operation: 'create',
      args: { data: { email: 'a@b.c', documentId: '0102030405' } },
      query: async (args: any) => {
        seen = structuredClone(args);
        return { ...args.data };
      },
    });
    expect(seen.data.documentId.startsWith('enc:v1:')).toBe(true);
    expect(seen.data.email).toBe('a@b.c');
    expect(result.documentId).toBe('0102030405');
  });

  it('cifra cada elemento de las listas (alergias, enfermedades…)', async () => {
    let seen: any;
    const result = await hook({
      model: 'MedicalHistory',
      operation: 'create',
      args: { data: { drugAllergies: ['penicilina', 'látex'], surgicalHistory: 'apendicectomía' } },
      query: async (args: any) => {
        seen = structuredClone(args);
        return { ...args.data };
      },
    });
    expect(seen.data.drugAllergies.every((v: string) => v.startsWith('enc:v1:'))).toBe(true);
    expect(JSON.stringify(seen)).not.toContain('penicilina');
    expect(result.drugAllergies).toEqual(['penicilina', 'látex']);
    expect(result.surgicalHistory).toBe('apendicectomía');
  });

  it('cifra tanto create como update en un upsert, y el formato { set }', async () => {
    let seen: any;
    await hook({
      model: 'MedicalHistory',
      operation: 'upsert',
      args: { create: { drugAllergies: ['a'] }, update: { drugAllergies: { set: ['b'] }, surgicalHistory: 'x' } },
      query: async (args: any) => {
        seen = structuredClone(args);
        return null;
      },
    });
    expect(seen.create.drugAllergies[0].startsWith('enc:v1:')).toBe(true);
    expect(seen.update.drugAllergies.set[0].startsWith('enc:v1:')).toBe(true);
    expect(seen.update.surgicalHistory.startsWith('enc:v1:')).toBe(true);
  });

  it('descifra listas de resultados y no cifra dos veces', async () => {
    const enc = crypto.encrypt('xyz');
    let seen: any;
    const rows = await hook({
      model: 'User',
      operation: 'findMany',
      args: {},
      query: async () => [{ documentId: enc }, { documentId: null }],
    });
    expect(rows[0].documentId).toBe('xyz');
    expect(rows[1].documentId).toBeNull();

    await hook({
      model: 'User',
      operation: 'update',
      args: { data: { documentId: enc } },
      query: async (args: any) => {
        seen = args;
        return {};
      },
    });
    expect(seen.data.documentId).toBe(enc);
  });

  it('descifra relaciones anidadas (include) de cualquier modelo', async () => {
    const result = await hook({
      model: 'Appointment',
      operation: 'findUnique',
      args: {},
      query: async () => ({
        id: 'a1',
        patient: {
          documentId: crypto.encrypt('0102'),
          guardian: { documentId: crypto.encrypt('0999') },
          medicalHistory: { drugAllergies: [crypto.encrypt('penicilina')] },
        },
      }),
    });
    expect(result.patient.documentId).toBe('0102');
    expect(result.patient.guardian.documentId).toBe('0999');
    expect(result.patient.medicalHistory.drugAllergies).toEqual(['penicilina']);
  });

  it('un valor corrupto no rompe la lectura completa', async () => {
    const result = await hook({
      model: 'User',
      operation: 'findFirst',
      args: {},
      query: async () => ({ documentId: 'enc:v1:AAAA', email: 'x@y.z' }),
    });
    expect(result.email).toBe('x@y.z');
    expect(result.documentId).toBe('enc:v1:AAAA');
  });

  it('procesa createMany con arreglos y deja intactos los modelos sin campos sensibles', async () => {
    let seen: any;
    await hook({
      model: 'User',
      operation: 'createMany',
      args: { data: [{ documentId: '1' }, { documentId: '2' }] },
      query: async (args: any) => {
        seen = args;
        return { count: 2 };
      },
    });
    expect(seen.data.every((d: any) => d.documentId.startsWith('enc:v1:'))).toBe(true);

    const untouched = { data: { note: 'texto' } };
    let passed: any;
    await hook({
      model: 'AuditLog',
      operation: 'create',
      args: untouched,
      query: async (args: any) => {
        passed = args;
        return {};
      },
    });
    expect(passed).toBe(untouched);
    expect(passed.data.note).toBe('texto');
  });
});
