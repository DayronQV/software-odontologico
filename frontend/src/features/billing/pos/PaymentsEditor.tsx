import { Button } from '../../../components/ui/Button';
import { Field, SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { CARD_METHODS, PAYMENT_LABELS, REFERENCE_METHODS, type PaymentMethod } from '../types';
import { fromCents, paidCents, type PosPayment } from './pos-calculations';

interface Props {
  payments: PosPayment[];
  payableCents: number;
  onChange: (payments: PosPayment[]) => void;
}

let counter = 0;
const nextKey = () => `pay-${++counter}`;

/** Pagos mixtos (RF-12): efectivo, tarjeta, transferencia y seguro en un mismo comprobante. */
export function PaymentsEditor({ payments, payableCents, onChange }: Props) {
  const remaining = payableCents - paidCents(payments);

  const add = () =>
    onChange([...payments, { key: nextKey(), method: 'CASH', amount: remaining > 0 ? fromCents(remaining) : 0, reference: '', cardToken: 'tok_visa' }]);
  const update = (key: string, patch: Partial<PosPayment>) => onChange(payments.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-3">
      {payments.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-slate-500">Agregue la forma de pago. Puede combinar varias.</p>}
      {payments.map((p) => (
        <div key={p.key} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[180px_130px_1fr_auto]">
          <SelectField label="Medio de pago" value={p.method} onChange={(e) => update(p.key, { method: e.target.value as PaymentMethod })}>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
          </SelectField>
          <Field label="Monto" type="number" step="0.01" min={0} inputMode="decimal" value={p.amount || ''} onChange={(e) => update(p.key, { amount: Number(e.target.value) })} />
          {REFERENCE_METHODS.includes(p.method) ? (
            <Field label={p.method === 'TRANSFER' ? 'N.º de transferencia' : 'N.º de autorización del seguro'} value={p.reference} onChange={(e) => update(p.key, { reference: e.target.value })} />
          ) : CARD_METHODS.includes(p.method) ? (
            <Field label="Token de tarjeta (pasarela simulada)" hint="Use tok_declined para probar un rechazo." value={p.cardToken} onChange={(e) => update(p.key, { cardToken: e.target.value })} />
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1 pb-0.5">
            {remaining !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => update(p.key, { amount: Math.max(0, p.amount + fromCents(remaining)) })}>Saldo</Button>
            )}
            <button type="button" aria-label="Quitar pago" onClick={() => onChange(payments.filter((x) => x.key !== p.key))} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Icon name="x" />
            </button>
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={add}><Icon name="plus" className="h-4 w-4" /> Agregar pago</Button>
    </div>
  );
}
