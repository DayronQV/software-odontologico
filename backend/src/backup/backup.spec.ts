import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptFile, deriveBackupKey, encryptFile } from './backup-crypto';
import { loadBackupConfig, type BackupConfig } from './backup-config';
import { BackupService, backupId, libpqUrl } from './backup-service';
import type { BackupStorage, StoredObject } from './backup-storage';
import { msUntilNext } from './cli';

const MASTER = randomBytes(32).toString('base64');

describe('cifrado de respaldos (AES-256-GCM)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sigo-bk-test-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const roundTrip = async (content: Buffer) => {
    const plain = join(dir, 'plain');
    const enc = join(dir, 'plain.enc');
    const back = join(dir, 'back');
    await writeFile(plain, content);
    const key = deriveBackupKey(MASTER);
    const digest = await encryptFile(plain, enc, key);
    return { enc, back, key, digest, plain };
  };

  it('descifra exactamente lo que cifró y el archivo cifrado no contiene el texto original', async () => {
    const content = Buffer.from('Paciente: Carlos Mendoza; alergia: penicilina'.repeat(2000));
    const { enc, back, key, digest } = await roundTrip(content);
    const stored = await readFile(enc);
    expect(stored.includes(Buffer.from('penicilina'))).toBe(false);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    await decryptFile(enc, back, key);
    expect((await readFile(back)).equals(content)).toBe(true);
  });

  it('detecta un archivo alterado (integridad GCM)', async () => {
    const { enc, back, key } = await roundTrip(randomBytes(5000));
    const bytes = await readFile(enc);
    bytes[100] ^= 0xff;
    await writeFile(enc, bytes);
    await expect(decryptFile(enc, back, key)).rejects.toThrow();
  });

  it('rechaza una clave distinta, un archivo ajeno y uno truncado', async () => {
    const { enc, back } = await roundTrip(randomBytes(2000));
    await expect(decryptFile(enc, back, deriveBackupKey(randomBytes(32).toString('base64')))).rejects.toThrow();
    const foreign = join(dir, 'foreign');
    await writeFile(foreign, randomBytes(200));
    await expect(decryptFile(foreign, back, deriveBackupKey(MASTER))).rejects.toThrow(/no es un respaldo/);
    await writeFile(foreign, Buffer.from('corto'));
    await expect(decryptFile(foreign, back, deriveBackupKey(MASTER))).rejects.toThrow(/incompleto/);
  });

  it('la clave de respaldo se deriva y no es la clave maestra; exige 32 bytes', () => {
    expect(deriveBackupKey(MASTER).equals(Buffer.from(MASTER, 'base64'))).toBe(false);
    expect(() => deriveBackupKey(Buffer.from('corta').toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('utilidades de respaldo', () => {
  it('quita el parámetro schema de Prisma para libpq', () => {
    expect(libpqUrl('postgresql://u:p@h:5432/db?schema=public')).toBe('postgresql://u:p@h:5432/db');
  });

  it('genera identificadores ordenables por fecha', () => {
    expect(backupId(new Date('2026-10-30T07:00:00.123Z'))).toBe('20261030T070000Z');
  });

  it('calcula la espera hasta la próxima hora programada (hoy o mañana)', () => {
    const now = new Date(2026, 9, 30, 1, 0, 0);
    expect(msUntilNext(2, now)).toBe(3_600_000);
    expect(msUntilNext(1, now)).toBe(86_400_000);
  });

  it('ignora variables vacías (Compose) y usa el valor por defecto', () => {
    const config = loadBackupConfig({
      DATABASE_URL: 'x', ENCRYPTION_KEY: MASTER, S3_ENDPOINT: 'http://s3', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b',
      BACKUP_S3_ENDPOINT: '', BACKUP_S3_ACCESS_KEY: '',
    });
    expect(config.BACKUP_S3_ENDPOINT).toBeUndefined();
  });

  it('valida la configuración y aplica valores por defecto', () => {
    expect(() => loadBackupConfig({})).toThrow(/Configuración de respaldos inválida/);
    const config = loadBackupConfig({
      DATABASE_URL: 'x', ENCRYPTION_KEY: MASTER, S3_ENDPOINT: 'http://s3', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b',
    });
    expect(config.BACKUP_RETENTION_DAYS).toBe(30);
    expect(config.BACKUP_HOUR).toBe(2);
  });
});

describe('retención de respaldos', () => {
  const config = loadBackupConfig({
    DATABASE_URL: 'x', ENCRYPTION_KEY: MASTER, S3_ENDPOINT: 'http://s3', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b',
    BACKUP_RETENTION_DAYS: '30',
  }) as BackupConfig;
  const now = new Date('2026-10-30T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const makeService = (objects: StoredObject[]) => {
    const deleted: string[] = [];
    const storage = {
      listTarget: async () => objects,
      deleteFromTarget: async (key: string) => void deleted.push(key),
    } as unknown as BackupStorage;
    return { service: new BackupService(config, storage, () => undefined), deleted };
  };
  const entry = (id: string, file: string, age: number): StoredObject => ({
    key: `backups/db/${id}/${file}`, size: 1, lastModified: daysAgo(age),
  });

  it('elimina los respaldos vencidos completos (dump y manifiesto) y conserva los vigentes', async () => {
    const { service, deleted } = makeService([
      entry('20250901T020000Z', 'sigo.dump.enc', 60), entry('20250901T020000Z', 'manifest.json', 60),
      entry('20261020T020000Z', 'sigo.dump.enc', 10), entry('20261020T020000Z', 'manifest.json', 10),
    ]);
    expect(await service.prune(now)).toBe(1);
    expect(deleted.sort()).toEqual([
      'backups/db/20250901T020000Z/manifest.json', 'backups/db/20250901T020000Z/sigo.dump.enc',
    ]);
  });

  it('nunca elimina el último respaldo aunque esté vencido', async () => {
    const { service, deleted } = makeService([
      entry('20250101T020000Z', 'sigo.dump.enc', 300), entry('20250101T020000Z', 'manifest.json', 300),
    ]);
    expect(await service.prune(now)).toBe(0);
    expect(deleted).toHaveLength(0);
  });
});
