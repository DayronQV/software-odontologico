import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField, TextareaField } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { api, ApiError } from '../../../lib/api';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { errorMessage } from '../../../lib/useResource';

export interface Medication {
  id: string;
  name: string;
  activeIngredient: string;
  presentation: string;
}

interface DraftItem {
  medicationId: string;
  name: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface AllergyConflict {
  drug: string;
  allergy: string;
}

const EMPTY_ITEM: DraftItem = { medicationId: '', name: '', dose: '', frequency: '', duration: '', instructions: '' };

const conflictsFrom = (error: unknown): AllergyConflict[] | null => {
  if (error instanceof ApiError && error.status === 409) {
    const details = error.details as { conflicts?: AllergyConflict[] } | undefined;
    return details?.conflicts ?? null;
  }
  return null;
};

/** Receta nueva: avisa en vivo si algún fármaco coincide con una alergia de la anamnesis. */
export function PrescriptionForm({ patientId, appointmentId, medications, onSaved, onCancel }: {
  patientId: string;
  appointmentId?: string;
  medications: Medication[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState('');
  const [conflicts, setConflicts] = useState<AllergyConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = items.filter((item) => item.name.trim().length >= 2);
  const checkKey = useDebouncedValue(JSON.stringify(named.map((i) => [i.medicationId, i.name])), 350);

  useEffect(() => {
    const list: Array<[string, string]> = JSON.parse(checkKey);
    if (list.length === 0) {
      setConflicts([]);
      return;
    }
    let alive = true;
    api<{ conflicts: AllergyConflict[] }>(`/patients/${patientId}/prescriptions/check`, {
      method: 'POST',
      body: { items: list.map(([medicationId, name]) => ({ medicationId: medicationId || undefined, name, dose: '-', frequency: '-', duration: '-' })) },
    })
      .then((result) => alive && setConflicts(result.conflicts))
      .catch(() => alive && setConflicts([]));
    return () => {
      alive = false;
    };
  }, [checkKey, patientId]);

  const update = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const pickMedication = (index: number, id: string) => {
    const medication = medications.find((m) => m.id === id);
    update(index, { medicationId: id, name: medication ? medication.name : '' });
  };

  const complete = items.every((i) => i.name.trim() && i.dose.trim() && i.frequency.trim() && i.duration.trim());
  const overrideOk = conflicts.length === 0 || override.trim().length >= 10;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/patients/${patientId}/prescriptions`, {
        method: 'POST',
        body: {
          appointmentId,
          diagnosis: diagnosis.trim() || undefined,
          notes: notes.trim() || undefined,
          allergyOverrideReason: conflicts.length > 0 ? override.trim() : undefined,
          items: items.map((i) => ({ ...i, medicationId: i.medicationId || undefined, instructions: i.instructions.trim() || undefined })),
        },
      });
      await onSaved();
    } catch (e) {
      const found = conflictsFrom(e);
      if (found) setConflicts(found);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {conflicts.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-900">
          <p className="font-semibold">Alerta de alergia</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {conflicts.map((c) => (
              <li key={`${c.drug}-${c.allergy}`}><strong>{c.drug}</strong>: el paciente es alérgico a «{c.allergy}».</li>
            ))}
          </ul>
          <div className="mt-3">
            <TextareaField
              label="Justificación para recetar de todos modos"
              hint="Mínimo 10 caracteres. Queda registrada en la receta."
              rows={2}
              maxLength={300}
              value={override}
              onChange={(event) => setOverride(event.target.value)}
            />
          </div>
        </div>
      )}

      {items.map((item, index) => (
        <fieldset key={index} className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Medicamento {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Del catálogo" value={item.medicationId} onChange={(event) => pickMedication(index, event.target.value)}>
              <option value="">Otro (escribir nombre)…</option>
              {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </SelectField>
            <Field label="Nombre" value={item.name} onChange={(event) => update(index, { name: event.target.value, medicationId: '' })} />
            <Field label="Dosis" placeholder="1 tableta" value={item.dose} onChange={(event) => update(index, { dose: event.target.value })} />
            <Field label="Frecuencia" placeholder="Cada 8 horas" value={item.frequency} onChange={(event) => update(index, { frequency: event.target.value })} />
            <Field label="Duración" placeholder="5 días" value={item.duration} onChange={(event) => update(index, { duration: event.target.value })} />
            <Field label="Indicaciones" placeholder="Con alimentos" value={item.instructions} onChange={(event) => update(index, { instructions: event.target.value })} />
          </div>
          {items.length > 1 && <Button variant="ghost" size="sm" onClick={() => setItems((c) => c.filter((_, i) => i !== index))}>Quitar medicamento</Button>}
        </fieldset>
      ))}
      {items.length < 10 && <Button variant="secondary" onClick={() => setItems((c) => [...c, { ...EMPTY_ITEM }])}>Agregar otro medicamento</Button>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Diagnóstico (opcional)" value={diagnosis} maxLength={300} onChange={(event) => setDiagnosis(event.target.value)} />
        <Field label="Observaciones (opcional)" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Una receta emitida no se modifica; si hay un error se anula y se emite otra.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={busy} disabled={!complete || !overrideOk}>Emitir receta</Button>
      </div>
    </form>
  );
}
