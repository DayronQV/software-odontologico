import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SelectField, TextareaField } from '../../../components/ui/Field';
import {
  FINDING_ORDER,
  FINDING_TYPES,
  STATUS_LABELS,
  SURFACE_LABELS,
  type Finding,
  type FindingStatus,
  type FindingType,
  type ToothSurface,
} from './findings';
import { FindingSwatch } from './OdontogramLegend';
import { ToothShape } from './ToothShape';
import { fdiToUniversal, toothName, usesIncisalEdge } from './tooth-notation';

export interface NewFinding {
  toothCode: number;
  surface: ToothSurface;
  type: FindingType;
  status: FindingStatus;
  notes?: string;
}

interface FindingPanelProps {
  toothCode: number;
  findings: Finding[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (finding: NewFinding) => Promise<void>;
  onChangeStatus: (finding: Finding, status: FindingStatus) => Promise<void>;
  onRemove: (finding: Finding, reason: string) => Promise<void>;
}

const STATUS_TONE = { EXISTING: 'neutral', PLANNED: 'warning', DONE: 'success' } as const;

/** Editor del diente elegido: diagrama grande con zonas de toque amplias, hallazgos vigentes y alta de uno nuevo. */
export function FindingPanel({ toothCode, findings, canEdit, busy, onAdd, onChangeStatus, onRemove }: FindingPanelProps) {
  const [type, setType] = useState<FindingType>('CARIES');
  const [status, setStatus] = useState<FindingStatus>('EXISTING');
  const [surface, setSurface] = useState<ToothSurface>('OCCLUSAL');
  const [notes, setNotes] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const whole = FINDING_TYPES[type].whole;
  const incisal = usesIncisalEdge(toothCode);
  const surfaceName = surface === 'OCCLUSAL' && incisal ? 'Incisal' : SURFACE_LABELS[surface];

  const add = async () => {
    await onAdd({
      toothCode,
      surface: whole ? 'WHOLE' : surface === 'WHOLE' ? 'OCCLUSAL' : surface,
      type,
      status,
      notes: notes.trim() || undefined,
    });
    setNotes('');
  };

  const confirmRemove = async (finding: Finding) => {
    await onRemove(finding, reason.trim());
    setRemoving(null);
    setReason('');
  };

  return (
    <aside aria-label={`Diente ${toothCode}`} className="space-y-5">
      <header className="flex items-center gap-4">
        <ToothShape
          toothCode={toothCode}
          findings={findings}
          size={canEdit ? 132 : 96}
          showLabels
          selectedSurface={whole ? null : surface}
          onSurfaceSelect={canEdit && !whole ? (s) => setSurface(s) : undefined}
        />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Diente {toothCode}</h3>
          <p className="text-sm text-slate-500">
            {toothName(toothCode)} · Universal {fdiToUniversal(toothCode)}
          </p>
          {canEdit && !whole && <p className="mt-1 text-xs text-slate-500">Toque una superficie del diagrama para elegirla.</p>}
        </div>
      </header>

      <section aria-label="Hallazgos vigentes">
        <h4 className="mb-2 text-sm font-semibold text-slate-800">Hallazgos vigentes</h4>
        {findings.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Diente sin hallazgos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li key={finding.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FindingSwatch type={finding.type} status={finding.status} />
                  <span className="text-sm font-medium text-slate-800">{FINDING_TYPES[finding.type].label}</span>
                  <span className="text-sm text-slate-500">
                    {finding.surface === 'OCCLUSAL' && incisal ? 'Incisal' : SURFACE_LABELS[finding.surface]}
                  </span>
                  <Badge tone={STATUS_TONE[finding.status]}>{STATUS_LABELS[finding.status]}</Badge>
                </div>
                {finding.notes && <p className="mt-1.5 text-sm text-slate-600">{finding.notes}</p>}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-44">
                      <SelectField
                        label="Cambiar estado"
                        value={finding.status}
                        disabled={busy}
                        onChange={(event) => void onChangeStatus(finding, event.target.value as FindingStatus)}
                      >
                        {(Object.keys(STATUS_LABELS) as FindingStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </SelectField>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(finding.id)}>Quitar</Button>
                  </div>
                )}
                {removing === finding.id && (
                  <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                    <TextareaField
                      label="Motivo de la corrección"
                      hint="Queda en el historial; el hallazgo no se borra."
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" disabled={reason.trim().length < 3} loading={busy} onClick={() => void confirmRemove(finding)}>
                        Confirmar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <section aria-label="Agregar hallazgo" className="space-y-3 border-t border-line pt-4">
          <h4 className="text-sm font-semibold text-slate-800">Agregar hallazgo</h4>
          <div role="radiogroup" aria-label="Tipo de hallazgo" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FINDING_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
                onClick={() => setType(option)}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm transition ${
                  type === option ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-line bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FindingSwatch type={option} />
                {FINDING_TYPES[option].label}
              </button>
            ))}
          </div>

          <div role="radiogroup" aria-label="Estado" className="flex gap-2">
            {(Object.keys(STATUS_LABELS) as FindingStatus[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={status === option}
                onClick={() => setStatus(option)}
                className={`min-h-11 flex-1 rounded-lg border px-2 text-sm font-medium transition ${
                  status === option ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-line bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {STATUS_LABELS[option]}
              </button>
            ))}
          </div>

          <p className="text-sm text-slate-600">
            Se registrará en: <strong className="font-medium text-slate-800">{whole ? 'diente completo' : surfaceName}</strong>
          </p>
          <TextareaField label="Observación (opcional)" rows={2} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <Button loading={busy} onClick={() => void add()}>Agregar hallazgo</Button>
        </section>
      )}
    </aside>
  );
}
