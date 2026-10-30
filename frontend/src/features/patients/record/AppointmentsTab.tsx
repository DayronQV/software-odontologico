import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { buildQuery } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { STATUS_META } from '../../agenda/appointment-status';
import { AppointmentDetailModal } from '../../agenda/detail/AppointmentDetailModal';
import type { Appointment } from '../../agenda/types';
import { usePatientRecord } from './PatientRecordLayout';

const DAY = 24 * 60 * 60_000;

/** Citas del paciente: próximas y recientes (la API consulta rangos de hasta 62 días). */
export function AppointmentsTab() {
  const { patient } = usePatientRecord();
  const [selected, setSelected] = useState<string | null>(null);

  const upcomingLoader = useCallback(() => {
    const from = new Date();
    return api<Appointment[]>(`/agenda/appointments${buildQuery({ patientId: patient.id, from: from.toISOString(), to: new Date(from.getTime() + 60 * DAY).toISOString() })}`);
  }, [patient.id]);
  const recentLoader = useCallback(() => {
    const to = new Date();
    return api<Appointment[]>(`/agenda/appointments${buildQuery({ patientId: patient.id, from: new Date(to.getTime() - 60 * DAY).toISOString(), to: to.toISOString() })}`);
  }, [patient.id]);

  const upcoming = useResource(upcomingLoader);
  const recent = useResource(recentLoader);

  const renderList = (list: Appointment[] | null, empty: string) =>
    list && list.length === 0 ? (
      <EmptyState icon="calendar" title={empty} />
    ) : (
      <ul className="divide-y divide-line">
        {(list ?? []).map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setSelected(a.id)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-1 py-3 text-left hover:bg-slate-50">
              <span>
                <span className="block text-sm font-medium text-slate-900">{formatDateTime(a.startAt)}</span>
                <span className="block text-xs text-slate-500">{a.professional.fullName} · {a.chair.name} · {a.procedures.map((p) => p.name).join(', ')}</span>
              </span>
              <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <Card
        title="Próximas citas"
        description="Próximos 60 días"
        action={<Link to={`/agenda?newFor=${patient.id}`}><Button size="sm"><Icon name="plus" className="h-4 w-4" /> Agendar</Button></Link>}
      >
        {upcoming.error && <InlineError>{upcoming.error}</InlineError>}
        {upcoming.loading && !upcoming.data ? <Spinner /> : renderList(upcoming.data, 'Sin citas próximas')}
      </Card>
      <Card title="Citas recientes" description="Últimos 60 días">
        {recent.error && <InlineError>{recent.error}</InlineError>}
        {recent.loading && !recent.data ? <Spinner /> : renderList(recent.data, 'Sin citas recientes')}
      </Card>
      <AppointmentDetailModal
        appointmentId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => { void upcoming.reload(); void recent.reload(); }}
      />
    </div>
  );
}
