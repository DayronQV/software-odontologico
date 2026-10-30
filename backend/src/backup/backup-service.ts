import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { decryptFile, deriveBackupKey, encryptFile } from './backup-crypto';
import type { BackupConfig } from './backup-config';
import { BackupStorage } from './backup-storage';

const run = promisify(execFile);

export interface BackupManifest {
  id: string;
  createdAt: string;
  database: { key: string; bytes: number; sha256: string; serverVersion: string };
  files: { total: number; copied: number; bytes: number };
  retentionDays: number;
}

/** libpq no acepta el parámetro `schema` que Prisma agrega a la URL. */
export function libpqUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
}

export function backupId(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * Respaldo de PostgreSQL (pg_dump formato custom, cifrado AES-256-GCM con clave derivada) y espejo
 * incremental de los documentos clínicos (inmutables: solo se copian los nuevos). Retención y restauración.
 */
export class BackupService {
  private readonly storage: BackupStorage;
  private readonly key: Buffer;

  constructor(
    private readonly config: BackupConfig,
    storage?: BackupStorage,
    private readonly log: (message: string) => void = console.log,
  ) {
    this.storage = storage ?? new BackupStorage(config);
    this.key = deriveBackupKey(config.ENCRYPTION_KEY);
  }

  private get dbPrefix(): string {
    return `${this.config.BACKUP_PREFIX}db/`;
  }

  private get filesPrefix(): string {
    return `${this.config.BACKUP_PREFIX}files/`;
  }

  async backup(): Promise<BackupManifest> {
    await this.storage.assertTargetReachable();
    const id = backupId();
    const dir = await mkdtemp(join(tmpdir(), 'sigo-backup-'));
    try {
      const dump = join(dir, 'sigo.dump');
      const encrypted = join(dir, 'sigo.dump.enc');
      await run('pg_dump', ['--format=custom', '--no-owner', '--file', dump, libpqUrl(this.config.DATABASE_URL)]);
      const { stdout } = await run('psql', ['-At', '-c', 'SHOW server_version', libpqUrl(this.config.DATABASE_URL)]);
      const digest = await encryptFile(dump, encrypted, this.key);
      const { size } = await stat(encrypted);
      const dbKey = `${this.dbPrefix}${id}/sigo.dump.enc`;
      await this.storage.uploadFile(dbKey, encrypted, 'application/octet-stream');
      this.log(`Base de datos respaldada: ${dbKey} (${size} bytes, cifrada)`);

      const files = await this.mirrorFiles();
      const manifest: BackupManifest = {
        id,
        createdAt: new Date().toISOString(),
        database: { key: dbKey, bytes: size, sha256: digest, serverVersion: stdout.trim() },
        files,
        retentionDays: this.config.BACKUP_RETENTION_DAYS,
      };
      await this.storage.putText(`${this.dbPrefix}${id}/manifest.json`, JSON.stringify(manifest, null, 2));
      const removed = await this.prune();
      this.log(`Respaldo ${id} completo; ${removed} respaldos antiguos eliminados`);
      return manifest;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Copia al espejo los documentos que aún no están (los adjuntos son inmutables: RN-01). */
  private async mirrorFiles(): Promise<BackupManifest['files']> {
    const [source, mirrored] = await Promise.all([
      this.storage.listSource(),
      this.storage.listTarget(this.filesPrefix),
    ]);
    const have = new Set(mirrored.map((o) => o.key.slice(this.filesPrefix.length)));
    let copied = 0;
    for (const object of source) {
      if (have.has(object.key)) continue;
      await this.storage.mirrorObject(object.key, `${this.filesPrefix}${object.key}`);
      copied += 1;
    }
    this.log(`Documentos: ${source.length} en total, ${copied} copiados al espejo`);
    return { total: source.length, copied, bytes: source.reduce((sum, o) => sum + o.size, 0) };
  }

  async list(): Promise<BackupManifest[]> {
    const objects = await this.storage.listTarget(this.dbPrefix);
    const manifests = await Promise.all(
      objects
        .filter((o) => o.key.endsWith('/manifest.json'))
        .map(async (o) => JSON.parse(await this.storage.getText(o.key)) as BackupManifest),
    );
    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Elimina los respaldos de base de datos que superan la retención. Conserva siempre el más reciente. */
  async prune(now = new Date()): Promise<number> {
    const objects = await this.storage.listTarget(this.dbPrefix);
    const limit = now.getTime() - this.config.BACKUP_RETENTION_DAYS * 86_400_000;
    const ids = [...new Set(objects.map((o) => o.key.slice(this.dbPrefix.length).split('/')[0]))].sort();
    const old = ids.slice(0, -1).filter((id) => {
      const object = objects.find((o) => o.key.startsWith(`${this.dbPrefix}${id}/`));
      return object !== undefined && object.lastModified.getTime() < limit;
    });
    for (const id of old) {
      for (const object of objects.filter((o) => o.key.startsWith(`${this.dbPrefix}${id}/`))) {
        await this.storage.deleteFromTarget(object.key);
      }
    }
    return old.length;
  }

  /**
   * Restaura un respaldo. Por seguridad exige indicar la base de datos de destino: no sobrescribe la
   * activa a menos que se pase explícitamente su URL. Verifica integridad (SHA-256 y etiqueta GCM).
   */
  async restore(id: string, targetDatabaseUrl: string, options: { files?: boolean } = {}): Promise<void> {
    const manifest = JSON.parse(await this.storage.getText(`${this.dbPrefix}${id}/manifest.json`)) as BackupManifest;
    const dir = await mkdtemp(join(tmpdir(), 'sigo-restore-'));
    try {
      const encrypted = join(dir, 'sigo.dump.enc');
      const dump = join(dir, 'sigo.dump');
      await this.storage.downloadFile(manifest.database.key, encrypted);
      if ((await sha256(encrypted)) !== manifest.database.sha256) {
        throw new Error('La huella SHA-256 del respaldo no coincide: archivo corrupto o alterado');
      }
      await decryptFile(encrypted, dump, this.key);
      await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--exit-on-error', '--dbname', libpqUrl(targetDatabaseUrl), dump]);
      this.log(`Base de datos restaurada desde ${id}`);
      if (options.files) {
        const mirrored = await this.storage.listTarget(this.filesPrefix);
        for (const object of mirrored) {
          await this.storage.restoreObject(object.key, object.key.slice(this.filesPrefix.length));
        }
        this.log(`Documentos restaurados: ${mirrored.length}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
