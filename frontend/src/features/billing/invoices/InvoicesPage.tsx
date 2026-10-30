import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { SelectField } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/Table';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { usePagedList } from '../../../lib/usePagedList';
import { PAYMENT_LABELS, type InvoiceListItem } from '../types';
import { InvoiceDetailModal } from './InvoiceDetailModal';

export function InvoicesPage() {
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, page, setPage, pageSize, reload } = usePagedList<InvoiceListItem>('/billing/invoices', {
    pageSize: 12,
    filters: { status },
  });

  const columns: Column<InvoiceListItem>[] = [
    { header: 'Comprobante', cell: (i) => <span className="font-mono text-sm font-medium text-slate-900">{i.displayNumber}</span> },
    { header: 'Paciente', cell: (i) => i.patientName },
    { header: 'Fecha', hideOnSmall: true, cell: (i) => formatDateTime(i.createdAt) },
    { header: 'Pagos', hideOnSmall: true, cell: (i) => <span className="text-xs text-slate-500">{i.methods.map((m) => PAYMENT_LABELS[m]).join(' + ')}</span> },
    { header: 'Total', align: 'right', cell: (i) => <span className="font-semibold text-slate-900">{formatMoney(i.payableTotal, i.currency)}</span> },
    {
      header: 'Estado',
      cell: (i) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={i.status === 'ISSUED' ? 'success' : 'danger'}>{i.status === 'ISSUED' ? 'Emitido' : 'Anulado'}</Badge>
          {i.fiscalStatus === 'PENDING' && <Badge tone="warning">Fiscal pendiente</Badge>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Comprobantes" description="Comprobantes electrónicos emitidos (simulados, sin validez fiscal)." />
      <Card flush>
        <div className="border-b border-line p-4">
          <div className="max-w-xs">
            <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ISSUED">Emitidos</option>
              <option value="VOIDED">Anulados</option>
            </SelectField>
          </div>
        </div>
        {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
        {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
          <EmptyState icon="receipt" title="Sin comprobantes" description="Los comprobantes emitidos en el punto de venta aparecerán aquí." />
        ) : (
          <DataTable columns={columns} rows={data?.items ?? []} getKey={(i) => i.id} caption="Comprobantes" onRowClick={(i) => setSelected(i.id)} />
        )}
        {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      </Card>
      <InvoiceDetailModal invoiceId={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />
    </>
  );
}
