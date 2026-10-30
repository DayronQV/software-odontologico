import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';

type EventType = 'NOTE' | 'PROCEDURE' | 'PRESCRIPTION' | 'CONSENT' | 'ATTACHMENT' | 'VITALS' | 'PERIO' | 'ODONTOGRAM' | 'APPOINTMENT' | 'BUDGET';

interface TimelineEvent {
  id: string;
  type: EventType;
  at: string;
  title: string;
  detail: string | null;
  author: string | null;
}

const META: Record<EventType, { label: string; dot: string; tab: string }> = {
  NOTE: { label: 'Evolución', dot: 'bg-brand-500', tab: 'evolution' },
  PROCEDURE: { label: 'Procedimiento', dot: 'bg-emerald-500', tab: 'evolution' },
  PRESCRIPTION: { label: 'Receta', dot: 'bg-violet-500', tab: 'prescriptions' },
  CONSENT: { label: 'Consentimiento', dot: 'bg-sky-500', tab: 'consents' },
  ATTACHMENT: { label: 'Adjunto', dot: 'bg-slate-400', tab: 'attachments' },
  VITALS: { label: 'Signos vitales', dot: 'bg-amber-400', tab: 'evolution' },
  PERIO: { label: 'Periodontograma', dot: 'bg-rose-400', tab: 'perio' },
  ODONTOGRAM: { label: 'Odontograma', dot: 'bg-teal-400', tab: 'odontogram' },
  APPOINTMENT: { label: 'Cita', dot: 'bg-slate-500', tab: 'appointments' },
  BUDGET: { label: 'Presupuesto', dot: 'bg-indigo-400', tab: 'plan' },
};

/** Línea de tiempo cronológica de la historia clínica. */
export function TimelineTab() {
  const { patient } = usePatientRecord();
  const loader = useCallback(() => api<TimelineEvent[]>(`/patients/${patient.id}/timeline`), [patient.id]);
  const { data, error, loading } = useResource(loader);

  return (
    <Card title="Línea de tiempo" description="Todo lo ocurrido en la historia clínica, del más reciente al más antiguo.">
      {loading && !data && <Spinner />}
      {error && <InlineError>{error}</InlineError>}
      {data && data.length === 0 && <EmptyState icon="clock" title="Sin eventos todavía" />}
      <ol className="relative ml-2 border-l border-line">
        {data?.map((event) => (
          <li key={`${event.type}-${event.id}`} className="mb-5 ml-5">
            <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${META[event.type].dot}`} aria-hidden="true" />
            <p className="text-xs text-slate-500">
              {formatDateTime(event.at)} · {META[event.type].label}
              {event.author ? ` · ${event.author}` : ''}
            </p>
            <p className="text-sm font-medium text-slate-900">
              <Link to={`/patients/${patient.id}/${META[event.type].tab}`} className="hover:text-brand-700 hover:underline">{event.title}</Link>
            </p>
            {event.detail && <p className="text-sm text-slate-600">{event.detail}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
