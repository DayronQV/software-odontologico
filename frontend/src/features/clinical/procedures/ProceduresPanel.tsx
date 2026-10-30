import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field, SelectField, TextareaField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useProcedures } from '../../catalog/useCatalog';
import { PasswordConfirmDialog } from '../shared/PasswordConfirmDialog';

interface ProcedureRecord {
  id: string;
  procedure: { code: string; name: string; category: string };
  toothCode: number | null;
  surface: string | null;
  notes: string | null;
  performedAt: string;
  performedBy: string | null;
  addenda: Array<{ id: string; content: string; author: string | null; signedAt: string; contentHash: string }>;
}

/**
 * Procedimientos realizados (RN-01). No existe botón de borrar ni de editar: un procedimiento
 * realizado solo se corrige con una adenda firmada por el profesional responsable.
 */
export function ProceduresPanel({ patientId, appointmentId }: { patientId: string; appointmentId?: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const isDentist = user?.role === 'ODONTOLOGO';
  const loader = useCallback(() => api<ProcedureRecord[]>(`/patients/${patientId}/procedure-records`), [patientId]);
  const { data, error, loading, reload } = useResource(loader);
  const procedures = useProcedures();

  const [registering, setRegistering] = useState(false);
  const [procedureId, setProcedureId] = useState('');
  const [toothCode, setToothCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [amending, setAmending] = useState<ProcedureRecord | null>(null);
  const [addendumText, setAddendumText] = useState('');

  const register = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api(`/patients/${patientId}/procedure-records`, {
        method: 'POST',
        body: { procedureId, appointmentId, toothCode: toothCode ? Number(toothCode) : undefined, notes: notes.trim() || undefined },
      });
      toast.push('success', 'Procedimiento registrado como realizado');
      setRegistering(false);
      setProcedureId('');
      setToothCode('');
      setNotes('');
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Procedimientos realizados"
      description="Un procedimiento realizado no se borra: se corrige únicamente con una adenda firmada."
      action={isDentist && <Button variant="secondary" onClick={() => setRegistering(true)}>Registrar procedimiento</Button>}
    >
      {loading && !data && <Spinner />}
      {error && <InlineError>{error}</InlineError>}
      {data && data.length === 0 && <EmptyState icon="tooth" title="Sin procedimientos realizados" />}
      <ul className="divide-y divide-line">
        {data?.map((record) => (
          <li key={record.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">
                  {record.procedure.name} {record.toothCode && <span className="text-slate-500">· diente {record.toothCode}</span>}
                </p>
                <p className="text-sm text-slate-500">{formatDateTime(record.performedAt)} · {record.performedBy}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="success">Realizado</Badge>
                {isDentist && <Button variant="ghost" size="sm" onClick={() => setAmending(record)}>Corregir con adenda</Button>}
              </div>
            </div>
            {record.notes && <p className="mt-1 text-sm text-slate-600">{record.notes}</p>}
            {record.addenda.map((a) => (
              <p key={a.id} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <strong>Adenda:</strong> {a.content} <span className="text-xs text-amber-800">— {a.author}, {formatDateTime(a.signedAt)}</span>
              </p>
            ))}
          </li>
        ))}
      </ul>

      <Modal open={registering} onClose={() => setRegistering(false)} title="Registrar procedimiento realizado">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void register();
          }}
        >
          <SelectField label="Procedimiento" value={procedureId} onChange={(event) => setProcedureId(event.target.value)}>
            <option value="">Seleccione…</option>
            {procedures.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.requiresConsent ? ' (requiere consentimiento)' : ''}</option>
            ))}
          </SelectField>
          <Field label="Diente (FDI, opcional)" type="number" inputMode="numeric" min={11} max={85} value={toothCode} onChange={(event) => setToothCode(event.target.value)} />
          <TextareaField label="Notas" rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Una vez registrado no se podrá modificar ni eliminar.</p>
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRegistering(false)}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={!procedureId}>Registrar</Button>
          </div>
        </form>
      </Modal>

      <PasswordConfirmDialog
        open={!!amending}
        title="Adenda al procedimiento realizado"
        description={amending && `Corrección firmada de «${amending.procedure.name}». El registro original no se modifica.`}
        confirmLabel="Firmar adenda"
        onClose={() => setAmending(null)}
        onConfirm={async (password) => {
          await api(`/procedure-records/${amending!.id}/addenda`, { method: 'POST', body: { content: addendumText, password } });
          setAmending(null);
          setAddendumText('');
          toast.push('success', 'Adenda firmada');
          await reload();
        }}
      >
        <TextareaField label="Corrección o aclaración" rows={4} maxLength={4000} value={addendumText} onChange={(event) => setAddendumText(event.target.value)} />
      </PasswordConfirmDialog>
    </Card>
  );
}
