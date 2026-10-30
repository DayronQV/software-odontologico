import { Link } from 'react-router-dom';
import { InlineNotice } from '../../../components/ui/Feedback';
import { formatDateTime, formatTime } from '../../../lib/format';
import type { Appointment } from '../types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function AppointmentInfo({ appointment: a }: { appointment: Appointment }) {
  return (
    <div className="space-y-4">
      {!a.patient.hasMedicalHistory && a.status !== 'CANCELED' && a.status !== 'NO_SHOW' && (
        <InlineNotice>
          El paciente no tiene anamnesis registrada: no se podrá iniciar la atención.{' '}
          <Link to={`/patients/${a.patient.id}/anamnesis`} className="font-semibold underline">Registrarla ahora</Link>
        </InlineNotice>
      )}
      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label="Paciente">
          <Link to={`/patients/${a.patient.id}`} className="font-medium text-brand-700 hover:underline">{a.patient.fullName}</Link>
          {a.patient.phone && <span className="block text-xs text-slate-500">{a.patient.phone}</span>}
        </Row>
        <Row label="Horario">
          {formatDateTime(a.startAt)} – {formatTime(a.endAt)}
        </Row>
        <Row label="Profesional">
          {a.professional.fullName}
          {a.professional.specialty && <span className="block text-xs text-slate-500">{a.professional.specialty}</span>}
        </Row>
        <Row label="Sillón">{a.chair.officeName} · {a.chair.name}</Row>
        <div className="sm:col-span-2">
          <Row label="Procedimientos">{a.procedures.map((p) => p.name).join(', ')}</Row>
        </div>
        {a.notes && <div className="sm:col-span-2"><Row label="Notas">{a.notes}</Row></div>}
        {a.cancelReason && <div className="sm:col-span-2"><Row label="Motivo de cancelación">{a.cancelReason}</Row></div>}
      </dl>
    </div>
  );
}
