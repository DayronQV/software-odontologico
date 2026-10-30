import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { TextareaField } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { errorMessage } from '../../../lib/useResource';
import { SOEP_FIELDS } from './notes-types';

type Values = Record<(typeof SOEP_FIELDS)[number]['key'], string>;
const EMPTY: Values = { subjective: '', objective: '', assessment: '', plan: '' };

interface Props {
  initial?: Partial<Values>;
  submitLabel: string;
  /** El asistente escribe notas clínicas propias, no la nota SOEP del odontólogo. */
  assistant?: boolean;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
}

/** Formulario de la nota de evolución: Subjetivo, Objetivo, Evaluación y Plan (RF-05). */
export function NoteForm({ initial, submitLabel, assistant = false, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Values>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = SOEP_FIELDS.every(({ key }) => values[key].trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      if (!initial) setValues(EMPTY);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {assistant && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Es una nota clínica del asistente: complementa, no sustituye la nota SOEP del odontólogo.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {SOEP_FIELDS.map(({ key, label, hint }) => (
          <TextareaField
            key={key}
            label={label}
            hint={hint}
            rows={4}
            maxLength={4000}
            value={values[key]}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
          />
        ))}
      </div>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={busy} disabled={!complete}>{submitLabel}</Button>
      </div>
    </form>
  );
}
