import { useCallback, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field } from '../../../components/ui/Field';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import type { VitalSignsRecord } from './notes-types';

const num = (text: string): number | undefined => (text.trim() === '' ? undefined : Number(text.replace(',', '.')));

const FIELDS = [
  { key: 'systolic', label: 'Sistólica (mmHg)', step: '1' },
  { key: 'diastolic', label: 'Diastólica (mmHg)', step: '1' },
  { key: 'pulse', label: 'Pulso (lpm)', step: '1' },
  { key: 'temperatureC', label: 'Temperatura (°C)', step: '0.1' },
  { key: 'oxygenSaturation', label: 'Saturación O₂ (%)', step: '1' },
  { key: 'weightKg', label: 'Peso (kg)', step: '0.1' },
] as const;

type Values = Record<(typeof FIELDS)[number]['key'], string>;
const EMPTY: Values = { systolic: '', diastolic: '', pulse: '', temperatureC: '', oxygenSaturation: '', weightKg: '' };

/** Signos vitales: los registra el asistente antes de la atención; se muestran el último y el historial. */
export function VitalsPanel({ patientId, appointmentId, canRecord }: { patientId: string; appointmentId?: string; canRecord: boolean }) {
  const toast = useToast();
  const loader = useCallback(() => api<VitalSignsRecord[]>(`/patients/${patientId}/vital-signs`), [patientId]);
  const { data, error, loading, reload } = useResource(loader);
  const [values, setValues] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api(`/patients/${patientId}/vital-signs`, {
        method: 'POST',
        body: { appointmentId, ...Object.fromEntries(FIELDS.map(({ key }) => [key, num(values[key])])) },
      });
      setValues(EMPTY);
      toast.push('success', 'Signos vitales registrados');
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const last = data?.[0];

  return (
    <Card title="Signos vitales" description="Se registran antes de la atención.">
      {loading && !data && <Spinner />}
      {error && <InlineError>{error}</InlineError>}
      {last ? (
        <div className="mb-4 rounded-xl bg-slate-50 p-4" aria-label="Última toma">
          <p className="text-xs text-slate-500">Última toma: {formatDateTime(last.recordedAt)} · {last.recordedBy}</p>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Presión', last.systolic && last.diastolic ? `${last.systolic}/${last.diastolic}` : '—'],
              ['Pulso', last.pulse ?? '—'],
              ['Temp.', last.temperatureC !== null ? `${last.temperatureC} °C` : '—'],
              ['SpO₂', last.oxygenSaturation !== null ? `${last.oxygenSaturation} %` : '—'],
              ['Peso', last.weightKg !== null ? `${last.weightKg} kg` : '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-base font-semibold tabular-nums text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        !loading && <p className="mb-4 text-sm text-slate-500">Todavía no hay signos vitales registrados.</p>
      )}

      {canRecord && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map(({ key, label, step }) => (
              <Field key={key} label={label} type="number" inputMode="decimal" step={step} value={values[key]} onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))} />
            ))}
          </div>
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={Object.values(values).every((v) => v === '')}>Registrar signos vitales</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
