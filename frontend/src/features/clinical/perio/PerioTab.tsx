import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { SelectField } from '../../../components/ui/Field';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import type { Notation } from '../odontogram/tooth-notation';
import { PerioEditor } from './PerioEditor';
import type { Summary } from './perio-calc';

interface ChartListItem {
  id: string;
  examinedAt: string;
  examiner: string | null;
  finalized: boolean;
  summary: Summary;
}

interface Comparison {
  before: { examinedAt: string; summary: Summary };
  after: { examinedAt: string; summary: Summary };
  improved: number;
  worsened: number;
  unchanged: number;
  changes: Array<{ toothCode: number; site: string; probingDepthBefore: number; probingDepthAfter: number; probingDepthChange: number; attachmentLevelChange: number }>;
}

function Compare({ patientId, charts }: { patientId: string; charts: ChartListItem[] }) {
  const [before, setBefore] = useState(charts.at(-1)?.id ?? '');
  const [after, setAfter] = useState(charts[0]?.id ?? '');
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Comparison>(`/patients/${patientId}/perio-charts/compare?before=${before}&after=${after}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const options = charts.map((c) => <option key={c.id} value={c.id}>{formatDateTime(c.examinedAt)}</option>);
  const worst = result?.changes.filter((c) => c.probingDepthChange > 0).sort((a, b) => b.probingDepthChange - a.probingDepthChange).slice(0, 8) ?? [];

  return (
    <Card title="Evolución entre exámenes" description="Compare dos exámenes para ver si mejoró o empeoró la salud periodontal.">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56"><SelectField label="Examen anterior" value={before} onChange={(e) => setBefore(e.target.value)}>{options}</SelectField></div>
        <div className="w-56"><SelectField label="Examen más reciente" value={after} onChange={(e) => setAfter(e.target.value)}>{options}</SelectField></div>
        <Button variant="secondary" loading={busy} disabled={!before || !after || before === after} onClick={() => void run()}>Comparar</Button>
      </div>
      {error && <div className="mt-3"><InlineError>{error}</InlineError></div>}
      {result && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <table className="w-full max-w-xl text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-1.5">Indicador</th><th>Anterior</th><th>Reciente</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-1.5">Sangrado al sondaje</td><td>{result.before.summary.bleedingPercent} %</td><td>{result.after.summary.bleedingPercent} %</td></tr>
              <tr><td className="py-1.5">Bolsas ≥ 4 mm</td><td>{result.before.summary.pocketPercent} %</td><td>{result.after.summary.pocketPercent} %</td></tr>
              <tr><td className="py-1.5">Profundidad promedio</td><td>{result.before.summary.meanProbingDepth} mm</td><td>{result.after.summary.meanProbingDepth} mm</td></tr>
            </tbody>
          </table>
          <p className="text-sm text-slate-600">
            Puntos que <strong className="text-emerald-700">mejoraron: {result.improved}</strong> · <strong className="text-rose-700">empeoraron: {result.worsened}</strong> · sin cambio: {result.unchanged}
          </p>
          {worst.length > 0 && (
            <ul className="text-sm text-slate-600">
              {worst.map((c) => (
                <li key={`${c.toothCode}-${c.site}`}>Diente {c.toothCode} · {c.site}: {c.probingDepthBefore} → {c.probingDepthAfter} mm (+{c.probingDepthChange})</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** Periodontograma digital (RF-04): lista de exámenes, captura, y comparación en el tiempo. */
export function PerioTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const canEdit = user?.role === 'ODONTOLOGO';
  const [notation, setNotation] = useState<Notation>('FDI');
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  const loader = useCallback(() => api<ChartListItem[]>(`/patients/${patient.id}/perio-charts`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);

  if (editing) {
    return (
      <PerioEditor
        patientId={patient.id}
        chartId={editing.id}
        canEdit={canEdit}
        notation={notation}
        onDone={() => {
          setEditing(null);
          void reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title="Exámenes periodontales"
        action={
          <div className="flex items-center gap-3">
            <div role="radiogroup" aria-label="Notación" className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {(['FDI', 'UNIVERSAL'] as const).map((option) => (
                <button key={option} type="button" role="radio" aria-checked={notation === option} onClick={() => setNotation(option)}
                  className={`min-h-10 rounded-md px-3 text-sm font-medium ${notation === option ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {option === 'FDI' ? 'FDI' : 'Universal'}
                </button>
              ))}
            </div>
            {canEdit && <Button onClick={() => setEditing({ id: null })}>Nuevo examen</Button>}
          </div>
        }
        flush
      >
        {loading && !data && <Spinner />}
        {error && <div className="p-5"><InlineError>{error}</InlineError></div>}
        {data && data.length === 0 && <EmptyState icon="tooth" title="Sin exámenes periodontales" description="Registre el primero para seguir la evolución de las encías." />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-line">
            {data.map((chart) => (
              <li key={chart.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-slate-900">{formatDateTime(chart.examinedAt)}</p>
                  <p className="text-sm text-slate-500">
                    {chart.examiner ?? '—'} · {chart.summary.sites} puntos · sangrado {chart.summary.bleedingPercent} % · bolsas {chart.summary.pocketPercent} %
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={chart.finalized ? 'success' : 'warning'}>{chart.finalized ? 'Finalizado' : 'Borrador'}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setEditing({ id: chart.id })}>
                    {chart.finalized || !canEdit ? 'Ver' : 'Continuar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data && data.filter((c) => c.finalized).length >= 2 && <Compare patientId={patient.id} charts={data.filter((c) => c.finalized)} />}
    </div>
  );
}
