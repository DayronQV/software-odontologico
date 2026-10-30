import { useState } from 'react';
import { AlertBadge } from '../../components/ui/AlertBadge';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePagedList } from '../../lib/usePagedList';
import { errorMessage } from '../../lib/useResource';

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

interface Verification {
  valid: boolean;
  checked: number;
  reason?: string;
  firstInvalidId?: string;
}

const columns: Column<AuditRow>[] = [
  { header: 'Fecha (UTC)', cell: (r) => <time dateTime={r.timestamp} className="whitespace-nowrap text-xs text-slate-600">{r.timestamp.replace('T', ' ').slice(0, 19)}</time> },
  { header: 'Acción', cell: (r) => <Badge tone={r.action.includes('FAIL') ? 'danger' : r.action === 'READ' ? 'info' : 'brand'}>{r.action}</Badge> },
  { header: 'Entidad', cell: (r) => <span className="font-medium text-slate-800">{r.entity}</span> },
  { header: 'Rol', hideOnSmall: true, cell: (r) => r.role ?? '—' },
  { header: 'IP', hideOnSmall: true, cell: (r) => <span className="font-mono text-xs">{r.ip ?? '—'}</span> },
];

export function AuditPage() {
  const toast = useToast();
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const filters = { action: useDebouncedValue(action.trim()), entity: useDebouncedValue(entity.trim()) };
  const { data, error, loading, page, setPage, pageSize } = usePagedList<AuditRow>('/audit', { pageSize: 15, filters });
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    setVerifying(true);
    try {
      setVerification(await api<Verification>('/audit/verify'));
    } catch (e) {
      toast.push('error', errorMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de quién accedió o modificó qué, cuándo y desde dónde."
        actions={<Button variant="secondary" onClick={verify} loading={verifying}><Icon name="shield" className="h-4 w-4" /> Verificar integridad</Button>}
      />
      {verification && (
        <div className="mb-4">
          <AlertBadge level={verification.valid ? 'success' : 'critical'}>
            {verification.valid ? `Cadena íntegra: ${verification.checked} registros verificados` : `¡Log alterado! ${verification.reason} (registro ${verification.firstInvalidId})`}
          </AlertBadge>
        </div>
      )}
      <Card flush>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
          <Field label="Acción" placeholder="LOGIN, READ, CREATE…" value={action} onChange={(e) => setAction(e.target.value)} />
          <Field label="Entidad" placeholder="Patient, Appointment, Invoice…" value={entity} onChange={(e) => setEntity(e.target.value)} />
        </div>
        {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
        {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
          <EmptyState icon="shield" title="Sin registros para este filtro" />
        ) : (
          <DataTable columns={columns} rows={data?.items ?? []} getKey={(r) => r.id} caption="Registros de auditoría" />
        )}
        {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      </Card>
    </>
  );
}
