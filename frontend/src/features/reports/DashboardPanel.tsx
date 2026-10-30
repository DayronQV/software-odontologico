import { formatMoney } from '../../lib/format';
import { METHOD_LABELS, type Dashboard } from './types';

function Kpi({ label, value, hint, tone = 'text-slate-900' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Barras horizontales de un solo color, con la etiqueta y el valor visibles (sin depender de librerías de gráficos). */
function Bars({ title, rows, currency }: { title: string; rows: Array<{ label: string; value: number }>; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-500">Sin datos en el período.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[8rem_1fr_6rem] items-center gap-2 text-xs">
              <span className="truncate text-slate-600" title={r.label}>{r.label}</span>
              <span className="h-3 rounded-full bg-slate-100"><span className="block h-3 rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></span>
              <span className="text-right tabular-nums text-slate-700">{formatMoney(r.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Panel con KPIs y gráficos del período. */
export function DashboardPanel({ data }: { data: Dashboard }) {
  const { kpis, currency } = data;
  const days = data.revenueByDay.slice(-14);
  return (
    <div className="space-y-5" data-testid="dashboard">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos" value={formatMoney(kpis.revenue, currency)} hint={`${kpis.invoices} comprobantes`} />
        <Kpi label="Citas" value={String(kpis.appointments)} hint={`Ocupación ${kpis.occupancy} %`} />
        <Kpi label="Tasa de No-Show" value={`${kpis.noShowRate} %`} tone={kpis.noShowRate > 15 ? 'text-amber-700' : 'text-slate-900'} />
        <Kpi label="Conversión de presupuestos" value={`${kpis.budgetConversion} %`} />
        <Kpi label="Comisiones por liquidar" value={formatMoney(kpis.pendingCommissions, currency)} />
        <Kpi label="Insumos bajo mínimo" value={String(kpis.lowStock)} tone={kpis.lowStock > 0 ? 'text-amber-700' : 'text-slate-900'} />
        <Kpi label="Lotes por vencer" value={String(kpis.expiring)} tone={kpis.expiring > 0 ? 'text-amber-700' : 'text-slate-900'} />
        <Kpi label="Período" value={`${data.period.from.slice(5)} → ${data.period.to.slice(5)}`} hint={data.cached ? 'Datos en caché (60 s)' : 'Datos recién calculados'} />
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Ingresos por día (últimos 14)" rows={days} currency={currency} />
        <Bars title="Ingresos por profesional" rows={data.revenueByProfessional} currency={currency} />
        <Bars title="Ingresos por método de pago" rows={data.paymentMethods.map((m) => ({ label: METHOD_LABELS[m.method] ?? m.method, value: m.amount }))} currency={currency} />
      </div>
    </div>
  );
}
