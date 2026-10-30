import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { Field, SelectField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatCalendarDate, formatDate, formatMoney } from '../../lib/format';
import { usePagedList } from '../../lib/usePagedList';
import { errorMessage, useResource } from '../../lib/useResource';
import { useOpenPdf } from '../clinical/shared/useOpenPdf';
import { useSettings } from '../catalog/SettingsProvider';
import { useProfessionals } from '../catalog/useCatalog';
import { SETTLEMENT_STATUS, type Entry, type Settlement } from './types';

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');
const today = () => new Date().toLocaleDateString('en-CA');

/** Comisiones devengadas y liquidación por período. El odontólogo ve solo las suyas, en lectura. */
export function SettlementsTab() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const pdf = useOpenPdf();
  const dentist = user?.role === 'ODONTOLOGO';
  const money = (v: number) => formatMoney(v, settings.currency);
  const professionals = useProfessionals();

  const list = useResource(useCallback(() => api<Settlement[]>('/commissions/settlements'), []));
  const entries = usePagedList<Entry>('/commissions/entries', { pageSize: 10 });
  const [form, setForm] = useState({ professionalId: '', start: monthStart(), end: today() });
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<(Settlement & { entries: Array<Entry & { id: string }> }) | null>(null);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await action();
      toast.push('success', done);
      await Promise.all([list.reload(), entries.reload()]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const columns: Column<Settlement>[] = [
    { header: 'N.º', cell: (s) => <code className="text-xs">{s.displayNumber}</code> },
    ...(dentist ? [] : [{ header: 'Profesional', cell: (s: Settlement) => <span className="font-medium text-slate-900">{s.professional}</span> }]),
    { header: 'Período', cell: (s) => `${formatCalendarDate(s.periodStart)} → ${formatCalendarDate(s.periodEnd)}` },
    { header: 'Total', align: 'right', cell: (s) => money(s.total) },
    { header: 'Estado', cell: (s) => <Badge tone={SETTLEMENT_STATUS[s.status].tone}>{SETTLEMENT_STATUS[s.status].label}</Badge> },
    {
      header: 'Acciones',
      align: 'right',
      cell: (s) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => void run(async () => setDetail(await api(`/commissions/settlements/${s.id}`)), 'Detalle cargado')}>Detalle</Button>
          <Button variant="secondary" size="sm" onClick={() => void pdf.open(`/commissions/settlements/${s.id}/pdf`)}>PDF</Button>
          {!dentist && s.status === 'DRAFT' && <Button size="sm" onClick={() => void run(() => api(`/commissions/settlements/${s.id}/approve`, { method: 'POST' }), 'Liquidación aprobada')}>Aprobar</Button>}
          {!dentist && s.status === 'APPROVED' && <Button size="sm" onClick={() => void run(() => api(`/commissions/settlements/${s.id}/pay`, { method: 'POST' }), 'Liquidación pagada')}>Marcar pagada</Button>}
          {!dentist && s.status === 'DRAFT' && <Button variant="ghost" size="sm" onClick={() => void run(() => api(`/commissions/settlements/${s.id}`, { method: 'DELETE' }), 'Borrador descartado')}>Descartar</Button>}
        </div>
      ),
    },
  ];

  const entryColumns: Column<Entry>[] = [
    { header: 'Fecha', cell: (e) => formatDate(e.createdAt) },
    ...(dentist ? [] : [{ header: 'Profesional', cell: (e: Entry) => e.professional }]),
    { header: 'Procedimiento', cell: (e) => `${e.kind === 'REVERSAL' ? '↩ ' : ''}${e.procedure ?? '—'}` },
    { header: 'Base', hideOnSmall: true, align: 'right', cell: (e) => money(e.baseAmount) },
    { header: 'Lab. + mat.', hideOnSmall: true, align: 'right', cell: (e) => money(e.labCost + e.materialsCost) },
    { header: 'Comisión', align: 'right', cell: (e) => <span className={e.amount < 0 ? 'text-rose-700' : ''}>{money(e.amount)}</span> },
    { header: 'Liquidada', cell: (e) => (e.settled ? <Badge tone="success">Sí</Badge> : <Badge>Pendiente</Badge>) },
  ];

  return (
    <div className="space-y-6">
      {!dentist && (
        <Card title="Nueva liquidación" description="Reúne las comisiones todavía sin liquidar del período (con sus reversiones) en un borrador.">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => api('/commissions/settlements', { method: 'POST', body: { professionalId: form.professionalId, periodStart: form.start, periodEnd: form.end } }), 'Borrador de liquidación creado'); }}>
            <div className="w-64"><SelectField label="Profesional" value={form.professionalId} onChange={(e) => setForm({ ...form, professionalId: e.target.value })}><option value="">Seleccione…</option>{professionals.data?.map((p) => <option key={p.id} value={p.id}>{p.user.fullName}</option>)}</SelectField></div>
            <div className="w-44"><Field label="Desde" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div className="w-44"><Field label="Hasta" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            <Button type="submit" disabled={!form.professionalId}>Crear borrador</Button>
          </form>
        </Card>
      )}
      {error && <InlineError>{error}</InlineError>}

      <Card flush title="Liquidaciones">
        {list.loading && !list.data ? <Spinner /> : list.data?.length === 0 ? <EmptyState icon="wallet" title="Sin liquidaciones" description={dentist ? 'Aparecerán cuando sean aprobadas.' : 'Cree la primera a partir de las comisiones devengadas.'} /> : <DataTable columns={columns} rows={list.data ?? []} getKey={(s) => s.id} caption="Liquidaciones de honorarios" />}
      </Card>

      <Card flush title="Comisiones devengadas" description="Se generan al cobrar cada procedimiento; una anulación agrega una reversión.">
        {entries.loading && !entries.data ? <Spinner /> : <DataTable columns={entryColumns} rows={entries.data?.items ?? []} getKey={(e) => e.id} caption="Comisiones devengadas" />}
        {entries.data && <div className="px-4 pb-4"><Pagination page={entries.page} pageSize={entries.pageSize} total={entries.data.total} onPageChange={entries.setPage} /></div>}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail ? `${detail.displayNumber} · ${detail.professional}` : ''}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{formatCalendarDate(detail.periodStart)} → {formatCalendarDate(detail.periodEnd)} · {SETTLEMENT_STATUS[detail.status].label} · <strong>{money(detail.total)}</strong></p>
            <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {detail.entries.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 px-3 py-2"><span>{formatDate(e.createdAt)} · {e.kind === 'REVERSAL' ? 'Reversión de ' : ''}{e.procedure ?? '—'}</span><span className={e.amount < 0 ? 'text-rose-700' : ''}>{money(e.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
