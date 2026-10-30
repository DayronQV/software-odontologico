import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { fromLocalInputValue, toLocalInputValue } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import { useOffices } from '../../catalog/useCatalog';
import type { Appointment } from '../types';

interface Props {
  appointment: Appointment;
  onDone: () => void;
  onCancel: () => void;
}

/** Cambia la hora y/o el sillón conservando la duración; la API valida conflictos (RN-03). */
export function RescheduleForm({ appointment: a, onDone, onCancel }: Props) {
  const toast = useToast();
  const { data: offices } = useOffices();
  const [start, setStart] = useState(toLocalInputValue(new Date(a.startAt)));
  const [chairId, setChairId] = useState(a.chair.id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/agenda/appointments/${a.id}/reschedule`, {
        method: 'PATCH',
        body: { startAt: fromLocalInputValue(start), chairId: chairId !== a.chair.id ? chairId : undefined },
      });
      toast.push('success', 'Cita reprogramada. Se avisó al paciente.');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-line bg-slate-50/60 p-4">
      <p className="text-sm font-medium text-slate-800">Reprogramar cita</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva fecha y hora" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <SelectField label="Sillón" value={chairId} onChange={(e) => setChairId(e.target.value)}>
          {(offices ?? []).map((office) => (
            <optgroup key={office.id} label={office.name}>
              {office.chairs.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </SelectField>
      </div>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Volver</Button>
        <Button size="sm" onClick={save} loading={saving}>Guardar cambio</Button>
      </div>
    </div>
  );
}
