import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  /** Bucket de documentos clínicos (origen del espejo). */
  S3_BUCKET: z.string().default('sigo-files'),
  /** Destino de los respaldos: puede ser otro bucket o incluso otro proveedor. */
  BACKUP_S3_ENDPOINT: z.string().optional(),
  BACKUP_S3_ACCESS_KEY: z.string().optional(),
  BACKUP_S3_SECRET_KEY: z.string().optional(),
  BACKUP_S3_BUCKET: z.string().default('sigo-backups'),
  BACKUP_PREFIX: z.string().default('backups/'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  /** Hora local (0-23) del respaldo diario en modo `daemon`. */
  BACKUP_HOUR: z.coerce.number().int().min(0).max(23).default(2),
});

export type BackupConfig = z.infer<typeof schema>;

export function loadBackupConfig(source: NodeJS.ProcessEnv = process.env): BackupConfig {
  // Compose entrega variables vacías (`${VAR:-}`): se tratan como no definidas.
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = schema.safeParse(defined);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración de respaldos inválida -> ${fields}`);
  }
  return result.data;
}
