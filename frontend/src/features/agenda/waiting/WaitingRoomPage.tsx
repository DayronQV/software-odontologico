import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { formatWaiting, STATUS_META } from '../appointment-status';
import type { AppointmentStatus, WaitingAppointment } from '../types';
import { useAgendaRealtime } from '../useAgendaRealtime';

function WaitingCard({ item, now, onChange }: { item: WaitingAppointment; now: number; onChange: (id: string, to: AppointmentStatus) => void }) {
  return (
    <li className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/patients/${item.patient.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{item.patient.fullName}</Link>
          <p className="mt-0.5 text-sm text-slate-500">{item.professional.fullName} · {item.chair.name}</p>
          <p className="text-xs text-slate-400">Cita de las {formatTime(item.startAt)} · {item.procedures.map((p) => p.name).join(', ')}</p>
        </div>
        <Badge tone={STATUS_META[item.status].tone}>{item.status === 'WAITING_ROOM' ? formatWaiting(item.waitingSince, now) : 'En atención'}</Badge>
      </div>
      {!item.patient.hasMedicalHistory && item.status === 'WAITING_ROOM' && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Sin anamnesis: regístrela antes de iniciar la atención.</p>
      )}
      {item.allowedTransitions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.allowedTransitions.map((to) => (
            <Button key={to} size="sm" variant={to === 'IN_ATTENTION' || to === 'ATTENDED' ? 'primary' : 'secondary'} onClick={() => onChange(item.id, to)}>
              {STATUS_META[to].action}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/** Sala de espera de hoy en tiempo real (WSS), por orden de llegada. */
export function WaitingRoomPage() {
  const toast = useToast();
  const loader = useCallback(() => api<WaitingAppointment[]>('/agenda/appointments/waiting-room'), []);
  const { data, error, loading, reload } = useResource(loader);
  useAgendaRealtime(reload);

  // refresca los "hace X min" cada 30 s
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const change = async (id: string, to: AppointmentStatus) => {
    try {
      await api(`/agenda/appointments/${id}/status`, { method: 'POST', body: { to } });
      toast.push('success', STATUS_META[to].label);
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const waiting = (data ?? []).filter((a) => a.status === 'WAITING_ROOM');
  const inAttention = (data ?? []).filter((a) => a.status === 'IN_ATTENTION');

  return (
    <>
      <PageHeader title="Sala de espera" description="Pacientes que llegaron hoy. Se actualiza en tiempo real." />
      {error && <div className="mb-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`En sala de espera (${waiting.length})`} description="Por orden de llegada">
            {waiting.length === 0 ? <EmptyState icon="clock" title="Nadie esperando" description="Los pacientes aparecen aquí cuando recepción registra su llegada." /> : (
              <ul className="space-y-3">{waiting.map((i) => <WaitingCard key={i.id} item={i} now={now} onChange={change} />)}</ul>
            )}
          </Card>
          <Card title={`En atención (${inAttention.length})`}>
            {inAttention.length === 0 ? <EmptyState icon="tooth" title="Ninguna atención en curso" /> : (
              <ul className="space-y-3">{inAttention.map((i) => <WaitingCard key={i.id} item={i} now={now} onChange={change} />)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
