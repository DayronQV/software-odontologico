import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { TextareaField } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errorMessage } from '../../../lib/useResource';
import { STATUS_META } from '../appointment-status';
import type { Appointment, AppointmentStatus } from '../types';

interface Props {
  appointment: Appointment;
  onChanged: () => void;
  onReschedule: () => void;
}

/** Acciones de la cita según el estado y el perfil (RF-10). Cancelar exige un motivo. */
export function StatusActions({ appointment: a, onChanged, onReschedule }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const isReception = user?.role === 'RECEPCIONISTA';
  const canReschedule = isReception && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED');
  const canSimulateReply = isReception && a.status === 'SCHEDULED';

  const run = async (key: string, request: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError(null);
    try {
      await request();
      toast.push('success', success);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const change = (to: AppointmentStatus, why?: string) =>
    run(to, () => api(`/agenda/appointments/${a.id}/status`, { method: 'POST', body: { to, reason: why } }), `Cita: ${STATUS_META[to].label.toLowerCase()}`);

  const terminal = a.allowedTransitions.length === 0 && !canReschedule;
  if (terminal) return <p className="text-sm text-slate-500">Esta cita ya no admite más cambios.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {a.allowedTransitions
          .filter((to) => to !== 'CANCELED')
          .map((to) => (
            <Button key={to} variant={to === 'NO_SHOW' ? 'secondary' : 'primary'} loading={busy === to} onClick={() => void change(to)}>
              {STATUS_META[to].action}
            </Button>
          ))}
        {canSimulateReply && (
          <Button variant="secondary" loading={busy === 'reply'} onClick={() => void run('reply', () => api(`/agenda/appointments/${a.id}/patient-confirmation`, { method: 'POST' }), 'Confirmación del paciente registrada')}>
            El paciente respondió «SÍ»
          </Button>
        )}
        {canReschedule && <Button variant="secondary" onClick={onReschedule}>Reprogramar</Button>}
        {a.allowedTransitions.includes('CANCELED') && !cancelling && (
          <Button variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => setCancelling(true)}>Cancelar cita</Button>
        )}
      </div>

      {cancelling && (
        <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <TextareaField label="Motivo de la cancelación" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: el paciente avisó que no podrá asistir" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCancelling(false)}>Volver</Button>
            <Button variant="danger" size="sm" disabled={!reason.trim()} loading={busy === 'CANCELED'} onClick={() => void change('CANCELED', reason.trim())}>
              Confirmar cancelación
            </Button>
          </div>
        </div>
      )}
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}
