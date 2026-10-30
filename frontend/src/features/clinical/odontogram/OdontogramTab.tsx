import { useCallback, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errorMessage, useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { FindingPanel, type NewFinding } from './FindingPanel';
import type { Finding, FindingStatus, OdontogramData } from './findings';
import { Odontogram } from './Odontogram';
import { OdontogramHistory } from './OdontogramHistory';
import { OdontogramLegend } from './OdontogramLegend';
import type { Dentition, Notation } from './tooth-notation';

const DENTITION_LABELS: Record<Dentition, string> = {
  PERMANENT: 'Permanente (32)',
  PRIMARY: 'Temporal (20)',
  MIXED: 'Mixta (32 + 20)',
};

/** Cierre del día elegido, en hora local. */
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

/** Odontograma interactivo (RF-03): notación FDI/Universal, 5 superficies, catálogo visual e historial. */
export function OdontogramTab({ compact = false }: { compact?: boolean }) {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === 'ODONTOLOGO';

  const [notation, setNotation] = useState<Notation>('FDI');
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [asOfDate, setAsOfDate] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(
    () => api<OdontogramData>(`/patients/${patient.id}/odontogram${asOfDate ? `?at=${encodeURIComponent(endOfDay(asOfDate))}` : ''}`),
    [patient.id, asOfDate],
  );
  const { data, error, loading, reload } = useResource(loader);

  const readOnlyHistory = !!asOfDate;
  const editable = canEdit && !readOnlyHistory;
  const toothFindings = useMemo(
    () => (data && selectedTooth ? data.findings.filter((f) => f.toothCode === selectedTooth) : []),
    [data, selectedTooth],
  );

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      toast.push('success', success);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const add = (finding: NewFinding) =>
    run(() => api(`/patients/${patient.id}/odontogram/findings`, { method: 'POST', body: finding }), 'Hallazgo registrado');
  const changeStatus = (finding: Finding, status: FindingStatus) =>
    run(() => api(`/patients/${patient.id}/odontogram/findings/${finding.id}`, { method: 'PATCH', body: { status } }), 'Estado actualizado');
  const remove = (finding: Finding, reason: string) =>
    run(() => api(`/patients/${patient.id}/odontogram/findings/${finding.id}/remove`, { method: 'POST', body: { reason } }), 'Hallazgo cerrado');
  const setDentition = (dentition: Dentition) =>
    run(() => api(`/patients/${patient.id}/odontogram/dentition`, { method: 'PUT', body: { dentition } }), 'Dentición actualizada');

  if (loading && !data) return <Spinner label="Cargando odontograma…" />;
  if (!data) return <InlineError>{error ?? 'No se pudo cargar el odontograma'}</InlineError>;

  return (
    <div className="space-y-5">
      {error && <InlineError>{error}</InlineError>}
      {actionError && <InlineError>{actionError}</InlineError>}
      {readOnlyHistory && (
        <InlineNotice>
          Mostrando el estado del odontograma al {asOfDate}. Es una consulta: para registrar cambios vuelva a la fecha de hoy.
        </InlineNotice>
      )}

      <Card
        title="Odontograma"
        action={
          <div className="flex flex-wrap items-end gap-3">
            <div role="radiogroup" aria-label="Notación" className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {(['FDI', 'UNIVERSAL'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={notation === option}
                  onClick={() => setNotation(option)}
                  className={`min-h-10 rounded-md px-3 text-sm font-medium transition ${
                    notation === option ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option === 'FDI' ? 'FDI' : 'Universal'}
                </button>
              ))}
            </div>
            <label className="text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Dentición</span>
              <select
                aria-label="Dentición"
                value={data.dentition}
                disabled={!editable || busy}
                onChange={(event) => void setDentition(event.target.value as Dentition)}
                className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm disabled:bg-slate-50"
              >
                {(Object.keys(DENTITION_LABELS) as Dentition[]).map((d) => (
                  <option key={d} value={d}>{DENTITION_LABELS[d]}</option>
                ))}
              </select>
            </label>
            {!compact && (
              <>
                <label className="text-sm text-slate-600">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Ver estado al</span>
                  <input
                    type="date"
                    value={asOfDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setAsOfDate(event.target.value)}
                    className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm"
                  />
                </label>
                {asOfDate && <Button variant="ghost" size="sm" onClick={() => setAsOfDate('')}>Hoy</Button>}
                <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>Historial</Button>
              </>
            )}
          </div>
        }
      >
        <Odontogram
          findings={data.findings}
          dentition={data.dentition}
          notation={notation}
          selectedTooth={selectedTooth}
          onSelectTooth={setSelectedTooth}
        />
        {!compact && (
          <div className="mt-4 border-t border-line pt-4">
            <OdontogramLegend />
          </div>
        )}
      </Card>

      {selectedTooth ? (
        <Card>
          <FindingPanel
            key={selectedTooth}
            toothCode={selectedTooth}
            findings={toothFindings}
            canEdit={editable}
            busy={busy}
            onAdd={add}
            onChangeStatus={changeStatus}
            onRemove={remove}
          />
          {!compact && (
            <div className="mt-4 border-t border-line pt-3">
              <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>Ver historial del diente {selectedTooth}</Button>
            </div>
          )}
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-white px-4 py-6 text-center text-sm text-slate-500">
          Toque un diente para ver o registrar sus hallazgos.
        </p>
      )}

      <OdontogramHistory patientId={patient.id} toothCode={selectedTooth} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
