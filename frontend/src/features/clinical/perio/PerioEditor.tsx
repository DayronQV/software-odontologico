import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { TextareaField } from '../../../components/ui/Field';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import { archTeeth, toothLabel, type Notation } from '../odontogram/tooth-notation';
import {
  draftFromChart,
  EMPTY_DRAFT,
  measuredSites,
  siteKey,
  summarize,
  toothProgress,
  toPayload,
  type ChartResponse,
  type PerioDraft,
  type PerioSite,
  type SiteDraft,
  type ToothDraft,
} from './perio-calc';
import { PerioGraph } from './PerioGraph';
import { ToothCapture } from './ToothCapture';

const ALL_TEETH = [...archTeeth('UPPER', 'PERMANENT'), ...archTeeth('LOWER', 'PERMANENT')];
const PROGRESS_STYLE = {
  EMPTY: 'border-line bg-white text-slate-600',
  PARTIAL: 'border-amber-300 bg-amber-50 text-amber-800',
  COMPLETE: 'border-brand-300 bg-brand-50 text-brand-800',
} as const;

interface Props {
  patientId: string;
  /** `null` = examen nuevo. */
  chartId: string | null;
  canEdit: boolean;
  notation: Notation;
  onDone: () => void;
}

/** Captura y consulta de un examen periodontal (RF-04). Abierto = borrador editable; finalizado = congelado. */
export function PerioEditor({ patientId, chartId, canEdit, notation, onDone }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<PerioDraft>(EMPTY_DRAFT);
  const [meta, setMeta] = useState<{ examinedAt: string; examiner: string | null; finalized: boolean } | null>(null);
  const [loading, setLoading] = useState(!!chartId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number>(16);
  const [id, setId] = useState(chartId);

  useEffect(() => {
    if (!chartId) return;
    let alive = true;
    api<ChartResponse>(`/patients/${patientId}/perio-charts/${chartId}`)
      .then((chart) => {
        if (!alive) return;
        setDraft(draftFromChart(chart));
        setMeta({ examinedAt: chart.examinedAt, examiner: chart.examiner, finalized: chart.finalized });
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [patientId, chartId]);

  const readOnly = !canEdit || !!meta?.finalized;
  const summary = useMemo(() => summarize(measuredSites(draft)), [draft]);

  const setSite = useCallback((toothCode: number, site: PerioSite, patch: Partial<SiteDraft>) => {
    setDraft((current) => {
      const key = siteKey(toothCode, site);
      const base = current.sites[key] ?? { probingDepth: '', gingivalMargin: '', bleeding: false };
      return { ...current, sites: { ...current.sites, [key]: { ...base, ...patch } } };
    });
  }, []);

  const setTooth = useCallback((toothCode: number, patch: Partial<ToothDraft>) => {
    setDraft((current) => ({
      ...current,
      teeth: { ...current.teeth, [toothCode]: { ...(current.teeth[toothCode] ?? { furcation: 0, mobility: 0 }), ...patch } },
    }));
  }, []);

  const nextTooth = useCallback(() => {
    setSelectedTooth((current) => ALL_TEETH[(ALL_TEETH.indexOf(current) + 1) % ALL_TEETH.length]);
  }, []);

  const save = async (): Promise<string | null> => {
    const body = toPayload(draft);
    if (body.sites.length === 0) {
      setError('Registre la profundidad de al menos un punto.');
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = id
        ? await api<ChartResponse>(`/patients/${patientId}/perio-charts/${id}`, { method: 'PUT', body })
        : await api<ChartResponse>(`/patients/${patientId}/perio-charts`, { method: 'POST', body });
      setId(saved.id);
      return saved.id;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (await save()) toast.push('success', 'Borrador guardado');
  };

  const finalize = async () => {
    const savedId = await save();
    if (!savedId) return;
    setBusy(true);
    try {
      await api(`/patients/${patientId}/perio-charts/${savedId}/finalize`, { method: 'POST' });
      toast.push('success', 'Examen periodontal finalizado');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {meta ? `Examen del ${formatDateTime(meta.examinedAt)}` : 'Nuevo examen periodontal'}
          </h3>
          {meta?.examiner && <p className="text-sm text-slate-500">Registrado por {meta.examiner}</p>}
        </div>
        <div className="flex items-center gap-2">
          {meta?.finalized && <Badge tone="success">Finalizado</Badge>}
          <Button variant="ghost" onClick={onDone}>Volver a la lista</Button>
        </div>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <Card title="Indicadores del examen">
        <dl className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
          {[
            ['Puntos medidos', summary.sites],
            ['Sangrado al sondaje', `${summary.bleedingPercent} %`],
            ['Bolsas ≥ 4 mm', `${summary.pocketPercent} %`],
            ['Profundidad promedio', `${summary.meanProbingDepth} mm`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Gráfico del examen" description="Toque un diente para capturarlo o revisarlo.">
        <PerioGraph draft={draft} notation={notation} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
      </Card>

      <Card title="Captura por diente">
        <div className="mb-4 space-y-1.5" role="group" aria-label="Dientes del examen">
          {(['UPPER', 'LOWER'] as const).map((arch) => (
            <div key={arch} className="flex flex-wrap gap-1.5">
              {archTeeth(arch, 'PERMANENT').map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedTooth(code)}
                  aria-pressed={selectedTooth === code}
                  aria-label={`Diente ${toothLabel(code, notation)}, ${toothProgress(draft, code) === 'COMPLETE' ? 'completo' : toothProgress(draft, code) === 'PARTIAL' ? 'incompleto' : 'sin medir'}`}
                  className={`min-h-11 min-w-11 rounded-lg border px-2 text-sm font-medium tabular-nums transition ${PROGRESS_STYLE[toothProgress(draft, code)]} ${
                    selectedTooth === code ? 'ring-2 ring-brand-500' : ''
                  }`}
                >
                  {toothLabel(code, notation)}
                </button>
              ))}
            </div>
          ))}
        </div>
        <ToothCapture key={selectedTooth} toothCode={selectedTooth} draft={draft} readOnly={readOnly} onSite={setSite} onTooth={setTooth} onNext={nextTooth} />
      </Card>

      {!readOnly && (
        <Card>
          <TextareaField label="Observaciones del examen" maxLength={500} value={draft.notes} onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))} />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" loading={busy} onClick={() => void saveDraft()}>Guardar borrador</Button>
            <Button loading={busy} onClick={() => void finalize()}>Finalizar examen</Button>
          </div>
          <p className="mt-2 text-right text-xs text-slate-500">Al finalizar, el examen queda congelado; para ver la evolución se registra uno nuevo.</p>
        </Card>
      )}
    </div>
  );
}
