import { useCallback, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { Modal } from '../../../components/ui/Modal';
import { DataTable, type Column } from '../../../components/ui/Table';
import { TagInput } from '../../../components/ui/TagInput';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage, useResource } from '../../../lib/useResource';

interface Medication {
  id: string;
  name: string;
  activeIngredient: string;
  presentation: string;
  allergyGroups: string[];
}

const EMPTY = { name: '', activeIngredient: '', presentation: '', allergyGroups: [] as string[] };

/** Catálogo básico de medicamentos para las recetas; las «familias» sirven para alertar alergias. */
export function MedicationsPage() {
  const toast = useToast();
  const loader = useCallback(() => api<Medication[]>('/clinical/medications'), []);
  const { data, error, loading, reload } = useResource(loader);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (medication: Medication | null) => {
    setEditing({ id: medication?.id ?? null });
    setForm(medication ? { name: medication.name, activeIngredient: medication.activeIngredient, presentation: medication.presentation, allergyGroups: medication.allergyGroups } : EMPTY);
    setFormError(null);
  };

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (editing?.id) await api(`/clinical/medications/${editing.id}`, { method: 'PUT', body: form });
      else await api('/clinical/medications', { method: 'POST', body: form });
      toast.push('success', 'Medicamento guardado');
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Medication>[] = [
    { header: 'Medicamento', cell: (m) => <span className="font-medium text-slate-900">{m.name}</span> },
    { header: 'Principio activo', hideOnSmall: true, cell: (m) => m.activeIngredient },
    { header: 'Presentación', hideOnSmall: true, cell: (m) => m.presentation },
    { header: 'Familias (alergias)', cell: (m) => m.allergyGroups.join(', ') || '—' },
    { header: 'Acciones', align: 'right', cell: (m) => <Button variant="secondary" size="sm" onClick={() => open(m)}>Editar</Button> },
  ];

  return (
    <Card
      flush
      title="Medicamentos"
      description="Catálogo para las recetas. Las familias (p. ej. «penicilina») se cruzan con las alergias de la anamnesis."
      action={<Button onClick={() => open(null)}><Icon name="plus" className="h-4 w-4" /> Nuevo medicamento</Button>}
    >
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : <DataTable columns={columns} rows={data ?? []} getKey={(m) => m.id} caption="Medicamentos" />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar medicamento' : 'Nuevo medicamento'}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Nombre comercial o genérico" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <Field label="Principio activo" value={form.activeIngredient} onChange={(event) => setForm({ ...form, activeIngredient: event.target.value })} />
          <Field label="Presentación" placeholder="Tabletas 500 mg" value={form.presentation} onChange={(event) => setForm({ ...form, presentation: event.target.value })} />
          <TagInput label="Familias para alertas de alergia" hint="Enter o coma para agregar. Ej.: penicilina, betalactámico" value={form.allergyGroups} onChange={(allergyGroups) => setForm({ ...form, allergyGroups })} />
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={form.name.trim().length < 2 || form.activeIngredient.trim().length < 2 || form.presentation.trim().length < 2}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
