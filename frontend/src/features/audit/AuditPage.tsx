import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertBadge } from '../../components/ui/AlertBadge';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';

interface AuditRow {
  id: string;
  timestamp: string;
  userId: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
}

interface AuditPageData {
  total: number;
  page: number;
  pageSize: number;
  items: AuditRow[];
}

interface Verification {
  valid: boolean;
  checked: number;
  reason?: string;
  firstInvalidId?: string;
}

const PAGE_SIZE = 15;

const columns: Column<AuditRow>[] = [
  { header: 'Fecha (UTC)', cell: (r) => <time dateTime={r.timestamp}>{r.timestamp.replace('T', ' ').slice(0, 19)}</time> },
  { header: 'Acción', cell: (r) => <span className="font-mono text-xs">{r.action}</span> },
  { header: 'Entidad', cell: (r) => r.entity },
  { header: 'Rol', cell: (r) => r.role ?? '—', hideOnSmall: true },
  { header: 'IP', cell: (r) => r.ip ?? '—', hideOnSmall: true },
];

export function AuditPage() {
  const toast = useToast();
  const [data, setData] = useState<AuditPageData | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', entity: '' });
  const [draft, setDraft] = useState(filters);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filters.action) params.set('action', filters.action);
    if (filters.entity) params.set('entity', filters.entity);
    try {
      setData(await api<AuditPageData>(`/audit?${params.toString()}`));
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'No se pudo conectar.');
    }
  }, [page, filters, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const verify = async () => {
    setVerifying(true);
    try {
      setVerification(await api<Verification>('/audit/verify'));
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'No se pudo conectar.');
    } finally {
      setVerifying(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
        <Button variant="secondary" onClick={verify} loading={verifying}>
          Verificar integridad del log
        </Button>
      </div>

      {verification && (
        <AlertBadge level={verification.valid ? 'success' : 'critical'}>
          {verification.valid
            ? `Cadena íntegra: ${verification.checked} registros verificados`
            : `¡Log alterado! ${verification.reason} (registro ${verification.firstInvalidId})`}
        </AlertBadge>
      )}

      <form onSubmit={applyFilters} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Acción" placeholder="LOGIN, READ…" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        <Field label="Entidad" placeholder="User, Auth…" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} />
        <Button type="submit">Filtrar</Button>
      </form>

      <DataTable columns={columns} rows={data?.items ?? []} getKey={(r) => r.id} caption="Registros de auditoría" empty="Sin registros para este filtro" />

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data ? `${data.total} registros · página ${data.page} de ${totalPages}` : 'Cargando…'}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
