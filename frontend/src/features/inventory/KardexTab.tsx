import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { InlineError, Spinner } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { Pagination } from '../../components/ui/Pagination';
import { DataTable, type Column } from '../../components/ui/Table';
import { api } from '../../lib/api';
import { formatCalendarDate, formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/usePagedList';
import { useResource } from '../../lib/useResource';
import { MOVEMENT_LABELS, type InventoryItem, type Movement, type StockLocation } from './types';

/** Kardex: historial inmutable de movimientos por insumo y por ubicación. Se corrige con un ajuste, nunca editando. */
export function KardexTab() {
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const items = useResource(useCallback(() => api<InventoryItem[]>('/inventory/items'), []));
  const locations = useResource(useCallback(() => api<StockLocation[]>('/inventory/locations'), []));
  const { data, error, loading, page, setPage, pageSize } = usePagedList<Movement>('/inventory/movements', { pageSize: 25, filters: { itemId, locationId } });

  const columns: Column<Movement>[] = [
    { header: 'Fecha', cell: (m) => formatDateTime(m.createdAt) },
    { header: 'Tipo', cell: (m) => <Badge tone={m.quantity < 0 ? 'warning' : 'success'}>{MOVEMENT_LABELS[m.type] ?? m.type}</Badge> },
    { header: 'Insumo', cell: (m) => m.item.name },
    { header: 'Ubicación', hideOnSmall: true, cell: (m) => m.location },
    { header: 'Cantidad', align: 'right', cell: (m) => <span className={m.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}>{m.quantity > 0 ? '+' : ''}{m.quantity} {m.item.unit}</span> },
    { header: 'Detalle', hideOnSmall: true, cell: (m) => [m.supplier, m.lotCode && `lote ${m.lotCode}`, m.expiresAt && `vence ${formatCalendarDate(m.expiresAt)}`, m.reason].filter(Boolean).join(' · ') || '—' },
    { header: 'Registró', hideOnSmall: true, cell: (m) => m.by ?? '—' },
  ];

  return (
    <Card
      flush
      title="Kardex"
      description="Cada movimiento queda registrado y no se puede editar ni borrar."
      action={
        <div className="flex flex-wrap gap-2">
          <div className="w-52"><SelectField label="Insumo" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Todos</option>{items.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</SelectField></div>
          <div className="w-60"><SelectField label="Ubicación" value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Todas</option>{locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
        </div>
      }
    >
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : <DataTable columns={columns} rows={data?.items ?? []} getKey={(m) => m.id} caption="Movimientos de inventario" />}
      {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
    </Card>
  );
}
