import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError, InlineNotice } from '../../components/ui/Feedback';
import { Field, SelectField } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../../lib/useResource';
import { useSettings } from '../catalog/SettingsProvider';
import { useProcedures, useProfessionals } from '../catalog/useCatalog';
import { MODE_LABELS, type Mode } from './types';

interface Result {
  rule: { id: string | null; mode: Mode; value: number } | null;
  price?: number;
  labCost?: number;
  materialsCost?: number;
  calculationBase?: number;
  commission: number;
  message?: string;
}

/** Simulador: calcula una comisión con la regla vigente (o probando una modalidad) sin guardar nada. */
export function SimulatorTab() {
  const { settings } = useSettings();
  const professionals = useProfessionals();
  const procedures = useProcedures();
  const [form, setForm] = useState({ professionalId: '', procedureId: '', price: '', quantity: '1', mode: '' as Mode | '', value: '' });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (v: number | undefined) => formatMoney(v ?? 0, settings.currency);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api<Result>('/commissions/simulate', {
          method: 'POST',
          body: {
            professionalId: form.professionalId,
            procedureId: form.procedureId,
            price: form.price ? Number(form.price.replace(',', '.')) : undefined,
            quantity: Number(form.quantity) || 1,
            mode: form.mode && form.value ? form.mode : undefined,
            value: form.mode && form.value ? Number(form.value.replace(',', '.')) : undefined,
          },
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Simulador de comisión" description="Verifique el cálculo antes de cobrar. Por defecto usa la regla vigente del profesional.">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <SelectField label="Profesional" value={form.professionalId} onChange={(e) => setForm({ ...form, professionalId: e.target.value })}>
          <option value="">Seleccione…</option>
          {professionals.data?.map((p) => <option key={p.id} value={p.id}>{p.user.fullName}</option>)}
        </SelectField>
        <SelectField label="Procedimiento" value={form.procedureId} onChange={(e) => setForm({ ...form, procedureId: e.target.value })}>
          <option value="">Seleccione…</option>
          {procedures.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
        <Field label="Valor cobrado (opcional)" hint="Neto, sin impuestos. Por defecto, el precio del catálogo." inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <Field label="Cantidad" type="number" min={1} max={20} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <SelectField label="Probar otra modalidad (opcional)" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode | '' })}>
          <option value="">Usar la regla vigente</option>
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
        </SelectField>
        <Field label="Valor de esa modalidad" inputMode="decimal" disabled={!form.mode} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        <div className="md:col-span-2"><Button type="submit" loading={busy} disabled={!form.professionalId || !form.procedureId}>Calcular</Button></div>
      </form>

      {error && <div className="mt-4"><InlineError>{error}</InlineError></div>}
      {result && (
        <div className="mt-6" aria-live="polite">
          {!result.rule ? (
            <InlineNotice>{result.message}</InlineNotice>
          ) : (
            <dl className="grid max-w-md gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Modalidad</dt><dd>{MODE_LABELS[result.rule.mode]} ({result.rule.mode === 'FIXED_AMOUNT' ? money(result.rule.value) : `${result.rule.value} %`})</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Valor cobrado</dt><dd className="tabular-nums">{money(result.price)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Laboratorio</dt><dd className="tabular-nums">−{money(result.labCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Materiales consumidos</dt><dd className="tabular-nums">−{money(result.materialsCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Base de cálculo</dt><dd className="tabular-nums">{money(result.calculationBase)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-slate-900"><dt>Comisión</dt><dd className="tabular-nums">{money(result.commission)}</dd></div>
            </dl>
          )}
        </div>
      )}
    </Card>
  );
}
