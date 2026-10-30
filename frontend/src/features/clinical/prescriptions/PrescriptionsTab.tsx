import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { useOpenPdf } from '../shared/useOpenPdf';
import { PrescriptionForm, type Medication } from './PrescriptionForm';

interface Prescription {
  id: string;
  displayNumber: string;
  prescriber: string | null;
  issuedAt: string;
  status: 'ISSUED' | 'VOIDED';
  diagnosis: string | null;
  allergyOverrideReason: string | null;
  void: { at: string; by: string | null; reason: string | null } | null;
  items: Array<{ id: string; name: string; dose: string; frequency: string; duration: string; instructions: string | null }>;
}

/** Recetas odontológicas: inmutables una vez emitidas; se corrigen anulando y emitiendo otra. */
export function PrescriptionsTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const toast = useToast();
  const pdf = useOpenPdf();
  const [params] = useSearchParams();
  const isDentist = user?.role === 'ODONTOLOGO';
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<Prescription | null>(null);

  const loader = useCallback(() => api<Prescription[]>(`/patients/${patient.id}/prescriptions`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);
  const medicationsLoader = useCallback(() => api<Medication[]>('/clinical/medications'), []);
  const medications = useResource(medicationsLoader);

  return (
    <Card
      title="Recetas"
      action={isDentist && <Button onClick={() => setCreating(true)}>Nueva receta</Button>}
      flush
    >
      {loading && !data && <Spinner />}
      {error && <div className="p-5"><InlineError>{error}</InlineError></div>}
      {data && data.length === 0 && <EmptyState icon="file" title="Sin recetas" description="Las recetas emitidas aparecerán aquí." />}
      <ul className="divide-y divide-line">
        {data?.map((p) => (
          <li key={p.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{p.displayNumber} <span className="font-normal text-slate-500">· {formatDateTime(p.issuedAt)} · {p.prescriber}</span></p>
                {p.diagnosis && <p className="text-sm text-slate-500">Diagnóstico: {p.diagnosis}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={p.status === 'ISSUED' ? 'success' : 'neutral'}>{p.status === 'ISSUED' ? 'Emitida' : 'Anulada'}</Badge>
                <Button variant="secondary" size="sm" loading={pdf.busy === `/prescriptions/${p.id}/pdf`} onClick={() => void pdf.open(`/prescriptions/${p.id}/pdf`)}>PDF</Button>
                {isDentist && p.status === 'ISSUED' && p.prescriber === user?.fullName && (
                  <Button variant="ghost" size="sm" onClick={() => setVoiding(p)}>Anular</Button>
                )}
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
              {p.items.map((item) => (
                <li key={item.id}>
                  <strong className="font-medium">{item.name}</strong> — {item.dose}, {item.frequency}, {item.duration}
                  {item.instructions && <span className="text-slate-500"> ({item.instructions})</span>}
                </li>
              ))}
            </ul>
            {p.allergyOverrideReason && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-900">Emitida pese a una alerta de alergia: {p.allergyOverrideReason}</p>
            )}
            {p.void && <p className="mt-2 text-xs text-slate-500">Anulada por {p.void.by} el {formatDateTime(p.void.at)}: {p.void.reason}</p>}
          </li>
        ))}
      </ul>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva receta" size="xl">
        <PrescriptionForm
          patientId={patient.id}
          appointmentId={params.get('appointment') ?? undefined}
          medications={medications.data ?? []}
          onCancel={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            toast.push('success', 'Receta emitida');
            await reload();
          }}
        />
      </Modal>

      <VoidDialog
        prescription={voiding}
        onClose={() => setVoiding(null)}
        onVoided={async () => {
          setVoiding(null);
          toast.push('success', 'Receta anulada');
          await reload();
        }}
      />
    </Card>
  );
}

function VoidDialog({ prescription, onClose, onVoided }: { prescription: Prescription | null; onClose: () => void; onVoided: () => Promise<void> }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  return (
    <Modal open={!!prescription} onClose={onClose} title={`Anular ${prescription?.displayNumber ?? ''}`}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api(`/prescriptions/${prescription!.id}/void`, { method: 'POST', body: { reason } });
            setReason('');
            await onVoided();
          } catch (e) {
            toast.push('error', errorMessage(e));
          }
        }}
      >
        <p className="text-sm text-slate-600">La receta no se borra: queda marcada como anulada con el motivo.</p>
        <label className="block text-sm font-medium text-slate-700">
          Motivo
          <textarea
            className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2"
            rows={3}
            minLength={5}
            maxLength={300}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={reason.trim().length < 5}>Anular receta</Button>
        </div>
      </form>
    </Modal>
  );
}
