import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { errorMessage, useResource } from '../../lib/useResource';
import type { StockLocation } from './types';

interface CountSummary {
  id: string;
  status: 'OPEN' | 'RECONCILED';
  location: string | null;
  createdAt: string;
  lines: number;
}
interface CountDetail {
  id: string;
  status: 'OPEN' | 'RECONCILED';
  location: string | null;
  lines: Array<{ itemId: string; item: string; unit: string; systemQty: number; countedQty: number | null }>;
}

/** Toma de inventario físico: se cuenta lo que hay y el auditor concilia contra el sistema (genera ajustes). */
export function CountsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const canReconcile = user?.role === 'AUDITOR' || user?.role === 'ADMIN_TI';
  const counts = useResource(useCallback(() => api<CountSummary[]>('/inventory/counts'), []));
  const locations = useResource(useCallback(() => api<StockLocation[]>('/inventory/locations'), []));
  const [locationId, setLocationId] = useState('');
  const [detail, setDetail] = useState<CountDetail | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const open = (id: string) =>
    run(async () => {
      const found = await api<CountDetail>(`/inventory/counts/${id}`);
      setDetail(found);
      setTyped(Object.fromEntries(found.lines.filter((l) => l.countedQty !== null).map((l) => [l.itemId, String(l.countedQty)])));
    });

  const saveCounts = () =>
    run(async () => {
      const lines = Object.entries(typed).filter(([, v]) => v.trim() !== '').map(([itemId, v]) => ({ itemId, countedQty: Number(v.replace(',', '.')) }));
      setDetail(await api<CountDetail>(`/inventory/counts/${detail!.id}`, { method: 'PUT', body: { lines } }));
      toast.push('success', 'Conteo guardado');
    });

  const reconcile = () =>
    run(async () => {
      await saveCounts();
      const result = await api<{ adjustments: number }>(`/inventory/counts/${detail!.id}/reconcile`, { method: 'POST' });
      toast.push('success', `Conciliación lista: ${result.adjustments} ajuste(s) generado(s)`);
      setDetail(null);
      await counts.reload();
    });

  return (
    <Card
      title="Inventario físico"
      description="Cuente lo que hay en cada ubicación; la conciliación ajusta el sistema con un movimiento por cada diferencia."
      action={
        <div className="flex items-end gap-2">
          <div className="w-64"><SelectField label="Ubicación" value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Seleccione…</option>{locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
          <Button disabled={!locationId} onClick={() => void run(async () => { const created = await api<CountDetail>('/inventory/counts', { method: 'POST', body: { locationId } }); await counts.reload(); await open(created.id); })}>Iniciar toma</Button>
        </div>
      }
    >
      {(counts.error || error) && <InlineError>{error ?? counts.error}</InlineError>}
      {counts.loading && !counts.data && <Spinner />}
      {counts.data?.length === 0 && <EmptyState icon="file" title="Sin tomas de inventario" description="Inicie una para contrastar el sistema con la existencia real." />}
      <ul className="divide-y divide-line">
        {counts.data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div><p className="font-medium text-slate-900">{c.location}</p><p className="text-sm text-slate-500">{formatDateTime(c.createdAt)} · {c.lines} insumos</p></div>
            <div className="flex items-center gap-2">
              <Badge tone={c.status === 'OPEN' ? 'warning' : 'success'}>{c.status === 'OPEN' ? 'Abierta' : 'Conciliada'}</Badge>
              <Button size="sm" variant="secondary" onClick={() => void open(c.id)}>{c.status === 'OPEN' ? 'Contar' : 'Ver'}</Button>
            </div>
          </li>
        ))}
      </ul>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={`Toma de inventario: ${detail?.location ?? ''}`}>
        {detail && (
          <div className="space-y-4">
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Insumo</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Diferencia</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {detail.lines.map((l) => {
                    const value = typed[l.itemId] ?? '';
                    const diff = value.trim() === '' ? null : Number(value.replace(',', '.')) - l.systemQty;
                    return (
                      <tr key={l.itemId}>
                        <td className="px-3 py-1.5">{l.item} <span className="text-slate-400">({l.unit})</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{l.systemQty}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input aria-label={`Contado ${l.item}`} inputMode="decimal" disabled={detail.status !== 'OPEN'} value={value} onChange={(e) => setTyped({ ...typed, [l.itemId]: e.target.value })} className="min-h-10 w-24 rounded-lg border border-line px-2 text-right tabular-nums" />
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${diff ? 'font-semibold text-rose-700' : ''}`}>{diff === null ? '—' : Math.round(diff * 1000) / 1000}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {detail.status === 'OPEN' && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => void saveCounts()}>Guardar conteo</Button>
                {canReconcile && <Button onClick={() => void reconcile()}>Conciliar con el sistema</Button>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
