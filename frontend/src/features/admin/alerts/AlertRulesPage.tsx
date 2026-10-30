import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field, SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { Modal } from '../../../components/ui/Modal';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage, useResource } from '../../../lib/useResource';
import type { AlertKind, AlertRule } from '../../catalog/types';

const KIND_LABELS: Record<AlertKind, string> = {
  DRUG_ALLERGY: 'Alergia a fármaco',
  SYSTEMIC_DISEASE: 'Enfermedad sistémica',
  COAGULOPATHY: 'Coagulopatía',
  ANTICOAGULANT: 'Paciente anticoagulado',
};
const NEEDS_KEYWORD: AlertKind[] = ['DRUG_ALLERGY', 'SYSTEMIC_DISEASE'];

const schema = z
  .object({
    label: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80),
    kind: z.enum(['DRUG_ALLERGY', 'SYSTEMIC_DISEASE', 'COAGULOPATHY', 'ANTICOAGULANT']),
    keyword: z.string().trim().max(60).optional(),
    severity: z.enum(['CRITICAL', 'WARNING']),
  })
  .refine((v) => !NEEDS_KEYWORD.includes(v.kind) || (v.keyword ?? '').length >= 2, {
    path: ['keyword'],
    message: 'Indique el texto a buscar en la anamnesis',
  });
type Form = z.infer<typeof schema>;

function RuleModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'DRUG_ALLERGY', severity: 'CRITICAL', label: '', keyword: '' },
  });
  const kind = useWatch({ control, name: 'kind' });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/catalog/alert-rules', { method: 'POST', body: { ...values, keyword: values.keyword || undefined } });
      toast.push('success', 'Regla creada');
      reset();
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={open} title="Nueva regla de alerta" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Texto del badge" placeholder="Alergia a látex" error={errors.label?.message} {...register('label')} />
        <SelectField label="Aplica a" {...register('kind')}>
          {(Object.keys(KIND_LABELS) as AlertKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </SelectField>
        {NEEDS_KEYWORD.includes(kind) && (
          <Field label="Texto a buscar" placeholder="latex" hint="Sin distinguir mayúsculas ni acentos." error={errors.keyword?.message} {...register('keyword')} />
        )}
        <SelectField label="Gravedad" {...register('severity')}>
          <option value="CRITICAL">Crítica (badge rojo)</option>
          <option value="WARNING">Advertencia (badge ámbar)</option>
        </SelectField>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Crear regla</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AlertRulesPage() {
  const toast = useToast();
  const loader = useCallback(() => api<AlertRule[]>('/catalog/alert-rules'), []);
  const { data, error, loading, reload } = useResource(loader);
  const [creating, setCreating] = useState(false);

  const toggle = async (rule: AlertRule) => {
    try {
      await api(`/catalog/alert-rules/${rule.id}`, { method: 'PATCH', body: { active: !rule.active } });
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const columns: Column<AlertRule>[] = [
    { header: 'Alerta', cell: (r) => <span className="font-medium text-slate-900">{r.label}</span> },
    { header: 'Aplica a', hideOnSmall: true, cell: (r) => KIND_LABELS[r.kind] },
    { header: 'Busca', hideOnSmall: true, cell: (r) => (r.keyword ? <code className="text-xs">{r.keyword}</code> : <span className="text-slate-400">cualquier entrada</span>) },
    { header: 'Gravedad', cell: (r) => <Badge tone={r.severity === 'CRITICAL' ? 'danger' : 'warning'}>{r.severity === 'CRITICAL' ? 'Crítica' : 'Advertencia'}</Badge> },
    { header: 'Estado', cell: (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Activa' : 'Inactiva'}</Badge> },
    { header: 'Acciones', align: 'right', cell: (r) => <Button variant="ghost" size="sm" onClick={() => void toggle(r)}>{r.active ? 'Desactivar' : 'Activar'}</Button> },
  ];

  return (
    <Card
      flush
      title="Alertas médicas"
      description="Reglas que convierten la anamnesis en avisos visibles en la cabecera del expediente."
      action={<Button onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" /> Nueva regla</Button>}
    >
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : <DataTable columns={columns} rows={data ?? []} getKey={(r) => r.id} caption="Reglas de alerta médica" />}
      <RuleModal open={creating} onClose={() => setCreating(false)} onSaved={() => void reload()} />
    </Card>
  );
}
