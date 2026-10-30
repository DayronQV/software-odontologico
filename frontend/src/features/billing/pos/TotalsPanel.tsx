import { formatMoney } from '../../../lib/format';
import { fromCents, type PosTotals } from './pos-calculations';

interface Props {
  totals: PosTotals;
  paidCents: number;
  currency: string;
  taxRatePercent: number;
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? 'border-t border-line pt-3 text-base font-semibold text-slate-900' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className={tone === 'ok' ? 'font-semibold text-emerald-700' : tone === 'warn' ? 'font-semibold text-amber-700' : ''}>{value}</dd>
    </div>
  );
}

export function TotalsPanel({ totals, paidCents, currency, taxRatePercent }: Props) {
  const money = (cents: number) => formatMoney(fromCents(cents), currency);
  const remaining = totals.payableCents - paidCents;
  return (
    <dl aria-label="Totales de la venta">
      <Row label="Subtotal" value={money(totals.grossCents)} />
      {totals.discountCents > 0 && <Row label="Descuentos" value={`− ${money(totals.discountCents)}`} />}
      <Row label="Base imponible" value={money(totals.netCents)} />
      <Row label={`Impuestos (${taxRatePercent}%)`} value={money(totals.taxCents)} />
      <Row label="Total" value={money(totals.totalCents)} strong />
      {totals.retentionCents > 0 && <Row label="Retenciones" value={`− ${money(totals.retentionCents)}`} />}
      {totals.retentionCents > 0 && <Row label="A cobrar" value={money(totals.payableCents)} strong />}
      <Row label="Pagado" value={money(paidCents)} />
      <Row
        label={remaining > 0 ? 'Falta por cobrar' : remaining < 0 ? 'Excede el total' : 'Saldo'}
        value={money(Math.abs(remaining))}
        tone={remaining === 0 && totals.totalCents > 0 ? 'ok' : 'warn'}
      />
    </dl>
  );
}
