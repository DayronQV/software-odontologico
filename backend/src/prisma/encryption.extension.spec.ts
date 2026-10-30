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

  it('cifra tanto create como update en un upsert, y el formato { set }', async () => {
    let seen: any;
    await hook({
      model: 'MfaSecret',
      operation: 'upsert',
      args: { create: { secret: 'AAAA' }, update: { secret: { set: 'BBBB' } } },
      query: async (args: any) => {
        seen = structuredClone(args);
        return null;
      },
    });
    expect(seen.create.secret.startsWith('enc:v1:')).toBe(true);
    expect(seen.update.secret.set.startsWith('enc:v1:')).toBe(true);
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
