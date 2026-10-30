import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BackupService, type BackupManifest } from '../backup/backup-service';
import { loadBackupConfig } from '../backup/backup-config';
import { NOTIFICATIONS_QUEUE } from '../queue/queue.module';
import { BlobStorageService } from '../files/blob-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type Probe = { status: 'up' | 'down'; latencyMs: number | null; detail?: string };

export interface SystemStatus {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  runtime: { node: string; memoryMb: number };
  services: { database: Probe; redis: Probe; storage: Probe };
  database: { sizeMb: number | null; connections: number | null };
  queue: { waiting: number; active: number; delayed: number; failed: number } | null;
  activity24h: { auditEntries: number; failedLogins: number; exports: number };
}

async function probe(action: () => Promise<unknown>): Promise<Probe> {
  const started = performance.now();
  try {
    await action();
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 'down', latencyMs: null, detail: error instanceof Error ? error.message : 'error' };
  }
}

/** Telemetría operativa para el administrador de TI (disponibilidad, RNF-02) sin exponer datos clínicos. */
@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: BlobStorageService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async status(): Promise<SystemStatus> {
    const [database, redis, storage] = await Promise.all([
      probe(() => this.prisma.db.$queryRaw`SELECT 1`),
      probe(() => this.redis.client.ping()),
      probe(() => this.storage.ping()),
    ]);
    const since = new Date(Date.now() - 86_400_000);
    const [dbInfo, queue, activity] = await Promise.all([
      this.databaseInfo(),
      this.queueCounts(),
      this.activity(since),
    ]);
    const healthy = database.status === 'up' && redis.status === 'up' && storage.status === 'up';
    return {
      status: healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      runtime: { node: process.version, memoryMb: Math.round(process.memoryUsage().rss / 1_048_576) },
      services: { database, redis, storage },
      database: dbInfo,
      queue,
      activity24h: activity,
    };
  }

  /** Respaldos disponibles (manifiestos del almacenamiento de respaldos). `configured:false` si no hay bucket. */
  async backups(): Promise<{ configured: boolean; retentionDays: number | null; items: BackupManifest[]; error?: string }> {
    try {
      const config = loadBackupConfig();
      const items = await new BackupService(config, undefined, () => undefined).list();
      return { configured: true, retentionDays: config.BACKUP_RETENTION_DAYS, items };
    } catch (error) {
      return { configured: false, retentionDays: null, items: [], error: error instanceof Error ? error.message : 'error' };
    }
  }

  private async databaseInfo(): Promise<SystemStatus['database']> {
    try {
      const [row] = await this.prisma.db.$queryRaw<Array<{ size: bigint; connections: bigint }>>`
        SELECT pg_database_size(current_database()) AS size,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections`;
      return { sizeMb: Math.round(Number(row.size) / 1_048_576), connections: Number(row.connections) };
    } catch {
      return { sizeMb: null, connections: null };
    }
  }

  private async queueCounts(): Promise<SystemStatus['queue']> {
    try {
      const c = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      return { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
    } catch {
      return null;
    }
  }

  private async activity(since: Date): Promise<SystemStatus['activity24h']> {
    const where = { timestamp: { gte: since } };
    const [auditEntries, failedLogins, exports] = await Promise.all([
      this.prisma.db.auditLog.count({ where }),
      this.prisma.db.auditLog.count({ where: { ...where, action: 'LOGIN_FAILED' } }),
      this.prisma.db.auditLog.count({ where: { ...where, action: 'EXPORT' } }),
    ]);
    return { auditEntries, failedLogins, exports };
  }
}
