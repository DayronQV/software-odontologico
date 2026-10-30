import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, SelectField } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/useResource';
import { useProcedures } from '../catalog/useCatalog';
import { FINDING_TYPES, type Finding } from '../clinical/odontogram/findings';
import type { PlanPhase } from './types';

/** Procedimiento sugerido según el tipo de hallazgo del odontograma (el profesional puede cambiarlo). */
const SUGGESTED_CATEGORY: Partial<Record<Finding['type'], string>> = {
  CARIES: 'Restauradora',
  ENDODONTICS_REQUIRED: 'Endodoncia',
  EXTRACTION: 'Cirugía',
  PROSTHESIS_FIXED: 'Prótesis',
  SEALANT: 'Preventiva',
};

/** Agrega un ítem al plan, opcionalmente a partir de un hallazgo planificado del odontograma. */
export function AddItemModal({ open, planId, phases, findings, onClose, onAdded }: {
  open: boolean;
  planId: string;
  phases: PlanPhase[];
  findings: Finding[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const procedures = useProcedures();
  const [findingId, setFindingId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [toothCode, setToothCode] = useState('');
  const [session, setSession] = useState('');
  const [fee, setFee] = useState('');
  const [labCost, setLabCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !phaseId && phases[0]) setPhaseId(phases[0].id);
  }, [open, phaseId, phases]);

  const procedure = procedures.data?.find((p) => p.id === procedureId);

  const chooseFinding = (id: string) => {
    setFindingId(id);
    const finding = findings.find((f) => f.id === id);
    if (!finding) return;
    setToothCode(String(finding.toothCode));
    const category = SUGGESTED_CATEGORY[finding.type];
    const suggestion = procedures.data?.find((p) => p.category === category);
    if (suggestion) setProcedureId(suggestion.id);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/treatment-plans/${planId}/items`, {
        method: 'POST',
        body: {
          phaseId,
          procedureId,
          toothCode: toothCode ? Number(toothCode) : undefined,
          sessionNumber: session ? Number(session) : undefined,
          fee: fee !== '' ? Number(fee) : undefined,
          labCost: labCost !== '' ? Number(labCost) : undefined,
          findingId: findingId || undefined,
        },
      });
      setFindingId('');
      setProcedureId('');
      setToothCode('');
      setSession('');
      setFee('');
      setLabCost('');
      await onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Agregar ítem al plan" size="lg">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {findings.length > 0 && (
          <SelectField label="A partir de un hallazgo del odontograma (opcional)" value={findingId} onChange={(event) => chooseFinding(event.target.value)}>
            <option value="">Ninguno</option>
            {findings.map((f) => (
              <option key={f.id} value={f.id}>Diente {f.toothCode} · {FINDING_TYPES[f.type].label}</option>
            ))}
          </SelectField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Fase" value={phaseId} onChange={(event) => setPhaseId(event.target.value)}>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
          <SelectField label="Procedimiento" value={procedureId} onChange={(event) => setProcedureId(event.target.value)}>
            <option value="">Seleccione…</option>
            {procedures.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
          <Field label="Diente (FDI, opcional)" type="number" inputMode="numeric" min={11} max={85} value={toothCode} onChange={(event) => setToothCode(event.target.value)} />
          <Field label="Sesión (opcional)" type="number" inputMode="numeric" min={1} max={50} value={session} onChange={(event) => setSession(event.target.value)} />
          <Field label="Honorarios" type="number" step="0.01" min={0} placeholder={procedure ? String(procedure.basePrice) : ''} hint="Vacío = precio del catálogo." value={fee} onChange={(event) => setFee(event.target.value)} />
          <Field label="Laboratorio" type="number" step="0.01" min={0} placeholder={procedure ? String(procedure.labCost) : ''} hint="Vacío = costo del catálogo." value={labCost} onChange={(event) => setLabCost(event.target.value)} />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!procedureId || !phaseId}>Agregar</Button>
        </div>
      </form>
    </Modal>
  );
}
