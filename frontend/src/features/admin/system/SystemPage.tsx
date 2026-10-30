import { useCallback } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { useResource } from '../../../lib/useResource';
import type { BackupList, SystemStatus } from './types';

const SERVICE_LABELS = { database: 'Base de datos (PostgreSQL)', redis: 'Sesiones y colas (Redis)', storage: 'Documentos (almacenamiento S3)' } as const;

const uptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
};

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warning' }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'warning' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}

/** Telemetría operativa (disponibilidad RNF-02) y respaldos cifrados, solo para el administrador de TI. */
export function SystemPage() {
  const status = useResource(useCallback(() => api<SystemStatus>('/system/status'), []));
  const backups = useResource(useCallback(() => api<BackupList>('/system/backups'), []));
  const s = status.data;
  const reload = () => void Promise.all([status.reload(), backups.reload()]);

  return (
    <div className="space-y-5">
      {status.error && <InlineError>{status.error}</InlineError>}
      {status.loading && !s && <Spinner />}
      {s && (
        <>
          <Card
            title="Estado de los servicios"
            description={`Versión ${s.version} · ${s.environment} · activo hace ${uptime(s.uptimeSeconds)} · actualizado ${formatDateTime(s.timestamp)}`}
            action={<div className="flex items-center gap-2"><Badge tone={s.status === 'ok' ? 'success' : 'danger'}>{s.status === 'ok' ? 'Operativo' : 'Degradado'}</Badge><Button size="sm" variant="secondary" onClick={reload}>Actualizar</Button></div>}
          >
            <ul className="divide-y divide-line">
              {(Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>).map((key) => {
                const probe = s.services[key];
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{SERVICE_LABELS[key]}</span>
                    <span className="flex items-center gap-3 text-slate-600">
                      {probe.latencyMs !== null && <span className="tabular-nums">{probe.latencyMs} ms</span>}
                      <Badge tone={probe.status === 'up' ? 'success' : 'danger'}>{probe.status === 'up' ? 'En línea' : 'Caído'}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Memoria del servidor" value={`${s.runtime.memoryMb} MB`} />
            <Stat label="Tamaño de la base" value={s.database.sizeMb === null ? '—' : `${s.database.sizeMb} MB`} />
            <Stat label="Conexiones a la base" value={s.database.connections ?? '—'} />
            <Stat label="Recordatorios en cola" value={s.queue ? s.queue.waiting + s.queue.delayed + s.queue.active : '—'} />
            <Stat label="Envíos fallidos" value={s.queue?.failed ?? '—'} tone={s.queue && s.queue.failed > 0 ? 'warning' : undefined} />
            <Stat label="Eventos de auditoría (24 h)" value={s.activity24h.auditEntries} />
            <Stat label="Ingresos fallidos (24 h)" value={s.activity24h.failedLogins} tone={s.activity24h.failedLogins > 10 ? 'warning' : undefined} />
            <Stat label="Exportaciones (24 h)" value={s.activity24h.exports} />
          </dl>
        </>
      )}

      <Card title="Respaldos cifrados" description="PostgreSQL (AES-256-GCM) y espejo de documentos. Diario; la restauración se hace desde el servidor (ver guía de restauración).">
        {backups.error && <InlineError>{backups.error}</InlineError>}
        {backups.loading && !backups.data && <Spinner />}
        {backups.data && !backups.data.configured && (
          <InlineNotice>El almacenamiento de respaldos no está configurado en este entorno. {backups.data.error}</InlineNotice>
        )}
        {backups.data?.configured && backups.data.items.length === 0 && <p className="text-sm text-slate-600">Todavía no hay respaldos. Se genera uno cada día; retención {backups.data.retentionDays} días.</p>}
        {backups.data?.configured && backups.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Respaldos disponibles</caption>
              <thead>
                <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-3 py-2">Fecha</th>
                  <th scope="col" className="px-3 py-2 text-right">Base de datos</th>
                  <th scope="col" className="px-3 py-2 text-right">Documentos</th>
                  <th scope="col" className="px-3 py-2">Huella SHA-256</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {backups.data.items.slice(0, 15).map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{megabytes(b.database.bytes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.files.total}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500" title={b.database.sha256}>{b.database.sha256.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
