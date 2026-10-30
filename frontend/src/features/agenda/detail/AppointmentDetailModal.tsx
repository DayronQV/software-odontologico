import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { api } from '../../../lib/api';
import { useResource } from '../../../lib/useResource';
import { STATUS_META } from '../appointment-status';
import type { Appointment } from '../types';
import { NotificationHistory, StatusHistory } from './AppointmentActivity';
import { AppointmentInfo } from './AppointmentInfo';
import { RescheduleForm } from './RescheduleForm';
import { StatusActions } from './StatusActions';

type Tab = 'detail' | 'history' | 'notifications';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'detail', label: 'Detalle' },
  { id: 'history', label: 'Historial' },
  { id: 'notifications', label: 'Notificaciones' },
];

interface Props {
  appointmentId: string | null;
  onClose: () => void;
  /** Se invoca tras cualquier cambio para que el calendario se actualice. */
  onChanged: () => void;
}

export function AppointmentDetailModal({ appointmentId, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('detail');
  const [rescheduling, setRescheduling] = useState(false);

  const loader = useCallback(
    () => (appointmentId ? api<Appointment>(`/agenda/appointments/${appointmentId}`) : Promise.resolve(null)),
    [appointmentId],
  );
  const { data: appointment, error, loading, reload } = useResource(loader);

  useEffect(() => {
    setTab('detail');
    setRescheduling(false);
  }, [appointmentId]);

  const changed = () => {
    setRescheduling(false);
    void reload();
    onChanged();
  };

  return (
    <Modal open={!!appointmentId} title="Cita" onClose={onClose} size="lg">
      {error && <InlineError>{error}</InlineError>}
      {loading && !appointment ? (
        <Spinner />
      ) : (
        appointment && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={STATUS_META[appointment.status].tone}>{STATUS_META[appointment.status].label}</Badge>
              <div role="tablist" aria-label="Secciones de la cita" className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'detail' && (
              <>
                <AppointmentInfo appointment={appointment} />
                <div className="border-t border-line pt-4">
                  {rescheduling ? (
                    <RescheduleForm appointment={appointment} onDone={changed} onCancel={() => setRescheduling(false)} />
                  ) : (
                    <StatusActions appointment={appointment} onChanged={changed} onReschedule={() => setRescheduling(true)} />
                  )}
                </div>
              </>
            )}
            {tab === 'history' && <StatusHistory appointmentId={appointment.id} />}
            {tab === 'notifications' && <NotificationHistory appointmentId={appointment.id} />}
          </div>
        )
      )}
    </Modal>
  );
}
