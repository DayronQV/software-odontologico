import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatTime } from '../../lib/format';
import { errorMessage, useResource } from '../../lib/useResource';

interface Row {
  appointmentId: string;
  startAt: string;
  patient: string;
  chair: string;
  procedures: string[];
  request: { id: string; status: 'REQUESTED' | 'PREPARED'; lines: Array<{ item: string; unit: string; quantity: number }> } | null;
}

const STATUS = { REQUESTED: { label: 'Por preparar', tone: 'warning' }, PREPARED: { label: 'Preparado', tone: 'success' } } as const;

/** Preparación de insumos del día (Asistente): se arma desde las recetas de cada cita y se marca como preparada. */
export function SupplyTab() {
  const { user } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const { data, error, loading, reload } = useResource(useCallback(() => api<Row[]>(`/inventory/supply?date=${date}`), [date]));
  const [actionError, setActionError] = useState<string | null>(null);
  const canPrepare = user?.role === 'ASISTENTE' || user?.role === 'ADMIN_TI';

  const run = async (action: () => Promise<unknown>, done: string) => {
    setActionError(null);
    try {
      await action();
      toast.push('success', done);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <Card title="Preparación de insumos" description="Citas del día y los insumos que necesitan según las recetas de consumo." action={<div className="w-44"><Field label="Día" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}>
      {(error || actionError) && <InlineError>{actionError ?? error}</InlineError>}
      {loading && !data && <Spinner />}
      {data?.length === 0 && <EmptyState icon="calendar" title="Sin citas ese día" />}
      <ul className="divide-y divide-line">
        {data?.map((row) => (
          <li key={row.appointmentId} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{formatTime(row.startAt)} · {row.patient}</p>
                <p className="text-sm text-slate-500">{row.chair} · {row.procedures.join(', ')}</p>
              </div>
              <div className="flex items-center gap-2">
                {row.request && <Badge tone={STATUS[row.request.status].tone}>{STATUS[row.request.status].label}</Badge>}
                {!row.request && <Button size="sm" variant="secondary" onClick={() => void run(() => api('/inventory/supply', { method: 'POST', body: { appointmentId: row.appointmentId } }), 'Insumos solicitados')}>Armar preparación</Button>}
                {row.request?.status === 'REQUESTED' && canPrepare && <Button size="sm" onClick={() => void run(() => api(`/inventory/supply/${row.request!.id}/prepare`, { method: 'POST' }), 'Insumos preparados')}>Marcar preparado</Button>}
              </div>
            </div>
            {row.request && (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                {row.request.lines.map((l) => <li key={l.item} className="rounded-full bg-slate-100 px-3 py-0.5">{l.item}: {l.quantity} {l.unit}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
