import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { formatMoney } from '../../../lib/format';
import type { Procedure } from '../../catalog/types';
import { toCents, fromCents, type PosLine } from './pos-calculations';

interface Props {
  lines: PosLine[];
  procedures: Procedure[];
  currency: string;
  /** Descuento máximo sin autorización (recepción). El administrador no tiene tope. */
  maxDiscountPercent: number;
  isAdmin: boolean;
  onChange: (lines: PosLine[]) => void;
}

let counter = 0;
const nextKey = () => `line-${++counter}`;

/** Líneas de la venta: procedimientos del catálogo o líneas libres, con cantidad y descuento. */
export function LinesEditor({ lines, procedures, currency, maxDiscountPercent, isAdmin, onChange }: Props) {
  const [free, setFree] = useState({ description: '', price: '' });

  const addProcedure = (id: string) => {
    const p = procedures.find((x) => x.id === id);
    if (!p) return;
    onChange([...lines, { key: nextKey(), procedureId: p.id, description: p.name, unitPrice: p.basePrice, quantity: 1, discountPercent: 0 }]);
  };

  const addFree = () => {
    const price = Number(free.price);
    if (!free.description.trim() || !(price >= 0)) return;
    onChange([...lines, { key: nextKey(), procedureId: null, description: free.description.trim(), unitPrice: price, quantity: 1, discountPercent: 0 }]);
    setFree({ description: '', price: '' });
  };

  const update = (key: string, patch: Partial<PosLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <SelectField label="Agregar procedimiento" value="" onChange={(e) => addProcedure(e.target.value)}>
          <option value="">Seleccione del catálogo…</option>
          {procedures.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.basePrice, currency)}</option>)}
        </SelectField>
        <div className="grid grid-cols-[1fr_110px_auto] items-end gap-2">
          <Field label="Línea libre" placeholder="Descripción" value={free.description} onChange={(e) => setFree({ ...free, description: e.target.value })} />
          <Field label="Precio" type="number" step="0.01" inputMode="decimal" value={free.price} onChange={(e) => setFree({ ...free, price: e.target.value })} />
          <Button variant="secondary" onClick={addFree} aria-label="Agregar línea libre"><Icon name="plus" className="h-4 w-4" /></Button>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate-500">Agregue al menos un procedimiento o línea libre.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {lines.map((line) => {
            const total = fromCents(toCents(line.unitPrice) * line.quantity * (1 - line.discountPercent / 100));
            const overLimit = !isAdmin && line.discountPercent > maxDiscountPercent;
            return (
              <li key={line.key} className="grid items-end gap-3 px-4 py-3 sm:grid-cols-[1fr_90px_110px_100px_auto]">
                <div>
                  <p className="text-sm font-medium text-slate-900">{line.description}</p>
                  <p className="text-xs text-slate-500">{formatMoney(line.unitPrice, currency)} c/u{line.procedureId ? '' : ' · línea libre'}</p>
                </div>
                <Field label="Cant." type="number" min={1} max={99} inputMode="numeric" value={line.quantity} onChange={(e) => update(line.key, { quantity: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} />
                <Field
                  label="Desc. %"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  inputMode="decimal"
                  value={line.discountPercent}
                  onChange={(e) => update(line.key, { discountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  error={overLimit ? `Máx. ${maxDiscountPercent}%` : undefined}
                />
                <p className="pb-3 text-right text-sm font-semibold text-slate-900">{formatMoney(total, currency)}</p>
                <button type="button" aria-label={`Quitar ${line.description}`} onClick={() => onChange(lines.filter((l) => l.key !== line.key))} className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Icon name="x" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!isAdmin && <p className="text-xs text-slate-500">Descuento máximo sin autorización: {maxDiscountPercent}%. Más requiere al administrador.</p>}
    </div>
  );
}
