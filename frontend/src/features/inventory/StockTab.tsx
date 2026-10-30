import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError, InlineNotice, Spinner } from '../../components/ui/Feedback';
import { SelectField } from '../../components/ui/Field';
import { DataTable, type Column } from '../../components/ui/Table';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatCalendarDate } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { MovementModal, type MovementMode } from './MovementModal';
import type { InventoryAlerts, InventoryItem, StockLocation, StockRow } from './types';

/** Existencias por consultorio y por profesional, con alertas de stock mínimo y vencimiento. */
export function StockTab() {
  const { user } = useAuth();
  const canMove = user?.role === 'ADMIN_TI' || user?.role === 'ASISTENTE';
  const [locationId, setLocationId] = useState('');
  const [mode, setMode] = useState<MovementMode | null>(null);

  const locations = useResource(useCallback(() => api<StockLocation[]>('/inventory/locations'), []));
  const items = useResource(useCallback(() => api<InventoryItem[]>('/inventory/items'), []));
  const stock = useResource(useCallback(() => api<StockRow[]>(`/inventory/stock${locationId ? `?locationId=${locationId}` : ''}`), [locationId]));
  const alerts = useResource(useCallback(() => api<InventoryAlerts>('/inventory/alerts'), []));

  const reload = () => void Promise.all([stock.reload(), alerts.reload()]);
  const a = alerts.data;

  const columns: Column<StockRow>[] = [
    { header: 'Insumo', cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { header: 'Ubicación', cell: (r) => r.location },
    { header: 'Existencia', align: 'right', cell: (r) => <span className={r.quantity < 0 ? 'font-semibold text-rose-700' : ''}>{r.quantity} {r.unit}</span> },
    { header: 'Mínimo', hideOnSmall: true, align: 'right', cell: (r) => r.minStock },
    { header: 'Reservado', hideOnSmall: true, align: 'right', cell: (r) => r.reserved || '—' },
    { header: 'Valor', hideOnSmall: true, align: 'right', cell: (r) => r.value.toFixed(2) },
    { header: 'Estado', cell: (r) => (r.belowMinimum ? <Badge tone="warning">Bajo mínimo</Badge> : <Badge tone="success">Normal</Badge>) },
  ];

  return (
    <div className="space-y-5">
      {a && a.low.length > 0 && (
        <InlineNotice>
          <strong>Stock mínimo:</strong> {a.low.slice(0, 5).map((l) => `${l.item}${l.location ? ` (${l.location})` : ''}: ${l.quantity}/${l.minStock} ${l.unit}`).join(' · ')}
          {a.low.length > 5 && ` · y ${a.low.length - 5} más`}
        </InlineNotice>
      )}
      {a && a.expiring.length > 0 && (
        <InlineNotice>
          <strong>Vencimientos:</strong> {a.expiring.slice(0, 4).map((e) => `${e.item} lote ${e.lotCode ?? '—'} ${e.state === 'EXPIRED' ? 'venció' : 'vence'} el ${formatCalendarDate(e.expiresAt)}`).join(' · ')}
        </InlineNotice>
      )}
      {a && a.exceptions.length > 0 && (
        <InlineError>
          Descargos con stock insuficiente: {a.exceptions.slice(0, 3).map((e) => `${e.item} (faltaron ${e.missing})`).join(' · ')}
        </InlineError>
      )}

      <Card
        flush
        title="Existencias"
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64">
              <SelectField label="Ubicación" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Todas</option>
                {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </SelectField>
            </div>
            {canMove && (
              <>
                <Button onClick={() => setMode('entry')}>Entrada</Button>
                <Button variant="secondary" onClick={() => setMode('transfer')}>Traslado</Button>
                <Button variant="secondary" onClick={() => setMode('adjust')}>Ajuste</Button>
              </>
            )}
          </div>
        }
      >
        {stock.error && <div className="p-4"><InlineError>{stock.error}</InlineError></div>}
        {stock.loading && !stock.data ? <Spinner /> : <DataTable columns={columns} rows={stock.data ?? []} getKey={(r) => `${r.itemId}:${r.locationId}`} caption="Existencias por ubicación" empty="Todavía no hay existencias: registre una entrada." />}
      </Card>

      <MovementModal
        key={`${mode}-${locationId}`}
        mode={mode}
        items={items.data ?? []}
        locations={locations.data ?? []}
        defaultLocationId={locationId || undefined}
        onClose={() => setMode(null)}
        onSaved={() => {
          setMode(null);
          reload();
        }}
      />
    </div>
  );
}
