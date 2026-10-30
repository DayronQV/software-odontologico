import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/Table';
import { api } from '../../../lib/api';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import { PAYMENT_LABELS, type CashReport, type CashSessionRow } from '../types';

function ReportModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { settings } = useSettings();
  const loader = useCallback(() => (id ? api<CashReport>(`/billing/cash-sessions/${id}/report`) : Promise.resolve(null)), [id]);
  const { data, error, loading } = useResource(loader);
  const money = (v: number | null) => formatMoney(v ?? 0, settings.currency);

  return (
    <Modal open={!!id} title="Corte de caja" onClose={onClose}>
      {error && <InlineError>{error}</InlineError>}
      {loading && !data ? <Spinner /> : data && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">{data.openedBy} · {formatDateTime(data.openedAt)}{data.closedAt ? ` → ${formatDateTime(data.closedAt)}` : ' (abierta)'}</p>
          <dl className="space-y-2 rounded-xl border border-line p-4">
            <div className="flex justify-between"><dt className="text-slate-500">Fondo inicial</dt><dd>{money(data.openingFloat)}</dd></div>
            {data.payments.map((p) => (
              <div key={p.method} className="flex justify-between"><dt className="text-slate-500">{PAYMENT_LABELS[p.method]} ({p.count})</dt><dd>{money(p.total)}</dd></div>
            ))}
            <div className="flex justify-between"><dt className="text-slate-500">Devoluciones en efectivo</dt><dd>− {money(data.cashRefunds)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-slate-900"><dt>Efectivo esperado</dt><dd>{money(data.expectedCash)}</dd></div>
            {data.countedCash !== null && <div className="flex justify-between"><dt className="text-slate-500">Efectivo contado</dt><dd>{money(data.countedCash)}</dd></div>}
            {data.difference !== null && <div className={`flex justify-between font-semibold ${Number(data.difference) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}><dt>Diferencia</dt><dd>{money(data.difference)}</dd></div>}
          </dl>
          <p className="text-xs text-slate-500">Comprobantes emitidos: {data.invoicesIssued} · anulados: {data.invoicesVoided}</p>
          {data.closeNotes && <p className="text-xs text-slate-500">Observaciones: {data.closeNotes}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Cortes de caja con los totales del sistema: solo Administrador y Auditor/Contador. */
export function CashReportsView() {
  const { settings } = useSettings();
  const { data, error, loading, page, setPage, pageSize } = usePagedList<CashSessionRow>('/billing/cash-sessions', { pageSize: 10 });
  const [selected, setSelected] = useState<string | null>(null);
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, settings.currency));

  const columns: Column<CashSessionRow>[] = [
    { header: 'Cajero', cell: (s) => <span className="font-medium text-slate-900">{s.openedBy}</span> },
    { header: 'Apertura', hideOnSmall: true, cell: (s) => formatDateTime(s.openedAt) },
    { header: 'Comprobantes', align: 'right', hideOnSmall: true, cell: (s) => s.invoiceCount },
    { header: 'Esperado', align: 'right', cell: (s) => money(s.expectedCash) },
    { header: 'Contado', align: 'right', hideOnSmall: true, cell: (s) => money(s.countedCash) },
    {
      header: 'Diferencia',
      align: 'right',
      cell: (s) => (s.difference === null ? <Badge tone="info">Abierta</Badge> : <span className={Number(s.difference) === 0 ? 'text-emerald-700' : 'font-medium text-amber-700'}>{money(s.difference)}</span>),
    },
  ];

  return (
    <Card flush title="Cortes de caja" description="Totales del sistema por sesión de caja.">
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
        <EmptyState icon="wallet" title="Sin sesiones de caja" description="Aparecerán cuando recepción abra su caja." />
      ) : (
        <DataTable columns={columns} rows={data?.items ?? []} getKey={(s) => s.id} caption="Sesiones de caja" onRowClick={(s) => setSelected(s.id)} />
      )}
      {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      <ReportModal id={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
