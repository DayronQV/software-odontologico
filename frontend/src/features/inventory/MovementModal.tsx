import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, SelectField } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/useResource';
import type { InventoryItem, StockLocation } from './types';

export type MovementMode = 'entry' | 'transfer' | 'adjust';

const TITLES: Record<MovementMode, string> = { entry: 'Entrada por compra', transfer: 'Traslado entre ubicaciones', adjust: 'Ajuste de inventario' };
const ENDPOINTS: Record<MovementMode, string> = { entry: '/inventory/entries', transfer: '/inventory/transfers', adjust: '/inventory/adjustments' };

/** Entrada (con proveedor, lote y vencimiento), traslado o ajuste (con motivo obligatorio). */
export function MovementModal({ mode, items, locations, defaultLocationId, onClose, onSaved }: {
  mode: MovementMode | null;
  items: InventoryItem[];
  locations: StockLocation[];
  defaultLocationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ itemId: '', locationId: defaultLocationId ?? '', toLocationId: '', quantity: '', supplier: '', lotCode: '', expiresAt: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async () => {
    if (!mode) return;
    setBusy(true);
    setError(null);
    const quantity = Number(form.quantity.replace(',', '.'));
    const body =
      mode === 'entry'
        ? { itemId: form.itemId, locationId: form.locationId, quantity, supplier: form.supplier || undefined, lotCode: form.lotCode || undefined, expiresAt: form.expiresAt || undefined }
        : mode === 'transfer'
          ? { itemId: form.itemId, fromLocationId: form.locationId, toLocationId: form.toLocationId, quantity, reason: form.reason || undefined }
          : { itemId: form.itemId, locationId: form.locationId, quantity, reason: form.reason };
    try {
      await api(ENDPOINTS[mode], { method: 'POST', body });
      setForm((f) => ({ ...f, quantity: '', reason: '', lotCode: '', expiresAt: '' }));
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const valid =
    !!form.itemId && !!form.locationId && Number(form.quantity.replace(',', '.')) !== 0 && !Number.isNaN(Number(form.quantity.replace(',', '.'))) &&
    (mode !== 'transfer' || (!!form.toLocationId && form.toLocationId !== form.locationId)) &&
    (mode !== 'adjust' || form.reason.trim().length >= 5);

  return (
    <Modal open={!!mode} onClose={onClose} title={mode ? TITLES[mode] : ''}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SelectField label="Insumo" value={form.itemId} onChange={set('itemId')}>
          <option value="">Seleccione…</option>
          {items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </SelectField>
        <SelectField label={mode === 'transfer' ? 'Origen' : 'Ubicación'} value={form.locationId} onChange={set('locationId')}>
          <option value="">Seleccione…</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </SelectField>
        {mode === 'transfer' && (
          <SelectField label="Destino" value={form.toLocationId} onChange={set('toLocationId')}>
            <option value="">Seleccione…</option>
            {locations.filter((l) => l.id !== form.locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
        )}
        <Field label={mode === 'adjust' ? 'Cantidad (negativa resta)' : 'Cantidad'} inputMode="decimal" value={form.quantity} onChange={set('quantity')} />
        {mode === 'entry' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Proveedor" value={form.supplier} onChange={set('supplier')} />
            <Field label="Lote" value={form.lotCode} onChange={set('lotCode')} />
            <Field label="Vencimiento" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
          </div>
        )}
        {mode !== 'entry' && (
          <Field label={mode === 'adjust' ? 'Motivo (obligatorio)' : 'Motivo (opcional)'} value={form.reason} maxLength={300} onChange={set('reason')} />
        )}
        {error && <InlineError>{error}</InlineError>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!valid}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}
