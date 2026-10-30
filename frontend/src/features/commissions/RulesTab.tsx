import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError, Spinner } from '../../components/ui/Feedback';
import { Field, SelectField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatCalendarDate } from '../../lib/format';
import { errorMessage, useResource } from '../../lib/useResource';
import { useProcedures, useProfessionals } from '../catalog/useCatalog';
import { MODE_LABELS, type Mode, type Rule } from './types';

const EMPTY = { professionalId: '', procedureId: '', mode: 'PERCENT' as Mode, value: '', validFrom: new Date().toISOString().slice(0, 10), validTo: '', priority: '0' };

/** Reglas de comisión por profesional y, opcionalmente, por procedimiento; con vigencia y prioridad. */
export function RulesTab() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === 'ADMIN_TI';
  const rules = useResource(useCallback(() => api<Rule[]>('/commissions/rules'), []));
  const professionals = useProfessionals();
  const procedures = useProcedures();
  const [editing, setEditing] = useState<{ id: string | null; active: boolean } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const open = (rule: Rule | null) => {
    setEditing({ id: rule?.id ?? null, active: rule?.active ?? true });
    setForm(rule ? { professionalId: rule.professionalId, procedureId: rule.procedureId ?? '', mode: rule.mode, value: String(rule.value), validFrom: rule.validFrom.slice(0, 10), validTo: rule.validTo?.slice(0, 10) ?? '', priority: String(rule.priority) } : EMPTY);
    setError(null);
  };

  const save = async () => {
    try {
      const body = { professionalId: form.professionalId, procedureId: form.procedureId || undefined, mode: form.mode, value: Number(form.value.replace(',', '.')), validFrom: form.validFrom, validTo: form.validTo || undefined, priority: Number(form.priority), active: editing?.active };
      await api(editing?.id ? `/commissions/rules/${editing.id}` : '/commissions/rules', { method: editing?.id ? 'PUT' : 'POST', body });
      toast.push('success', 'Regla guardada');
      setEditing(null);
      await rules.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const columns: Column<Rule>[] = [
    { header: 'Profesional', cell: (r) => <span className="font-medium text-slate-900">{r.professional}</span> },
    { header: 'Procedimiento', cell: (r) => r.procedure ?? <span className="text-slate-400">Todos</span> },
    { header: 'Modalidad', hideOnSmall: true, cell: (r) => MODE_LABELS[r.mode] },
    { header: 'Valor', align: 'right', cell: (r) => (r.mode === 'FIXED_AMOUNT' ? r.value.toFixed(2) : `${r.value} %`) },
    { header: 'Vigencia', hideOnSmall: true, cell: (r) => `${formatCalendarDate(r.validFrom)} → ${r.validTo ? formatCalendarDate(r.validTo) : 'sin fin'}` },
    { header: 'Prioridad', hideOnSmall: true, align: 'right', cell: (r) => r.priority },
    { header: 'Estado', cell: (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Activa' : 'Inactiva'}</Badge> },
    ...(canEdit ? [{ header: 'Acciones', align: 'right' as const, cell: (r: Rule) => <Button variant="secondary" size="sm" onClick={() => open(r)}>Editar</Button> }] : []),
  ];

  const valid = form.professionalId && form.value !== '' && form.validFrom;

  return (
    <Card flush title="Reglas de comisión" description="Con varias reglas vigentes gana la de mayor prioridad; con igual prioridad, la del procedimiento sobre la general." action={canEdit && <Button onClick={() => open(null)}>Nueva regla</Button>}>
      {rules.error && <div className="p-4"><InlineError>{rules.error}</InlineError></div>}
      {rules.loading && !rules.data ? <Spinner /> : <DataTable columns={columns} rows={rules.data ?? []} getKey={(r) => r.id} caption="Reglas de comisión" />}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar regla' : 'Nueva regla'}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <SelectField label="Profesional" value={form.professionalId} onChange={(e) => setForm({ ...form, professionalId: e.target.value })}>
            <option value="">Seleccione…</option>
            {professionals.data?.map((p) => <option key={p.id} value={p.id}>{p.user.fullName}</option>)}
          </SelectField>
          <SelectField label="Procedimiento" hint="Vacío = todos los procedimientos del profesional." value={form.procedureId} onChange={(e) => setForm({ ...form, procedureId: e.target.value })}>
            <option value="">Todos</option>
            {procedures.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
          <SelectField label="Modalidad" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode })}>
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={form.mode === 'FIXED_AMOUNT' ? 'Monto' : 'Porcentaje'} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <Field label="Prioridad" type="number" min={0} max={100} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Field label="Vigente desde" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
            <Field label="Hasta (opcional)" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          </div>
          {editing?.id && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Regla activa
            </label>
          )}
          {error && <InlineError>{error}</InlineError>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" disabled={!valid}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
