export interface Probe {
  status: 'up' | 'down';
  latencyMs: number | null;
  detail?: string;
}

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

export interface BackupManifest {
  id: string;
  createdAt: string;
  database: { key: string; bytes: number; sha256: string; serverVersion: string };
  files: { total: number; copied: number; bytes: number };
  retentionDays: number;
}

export interface BackupList {
  configured: boolean;
  retentionDays: number | null;
  items: BackupManifest[];
  error?: string;
}
