import { Link } from 'react-router-dom';
import { AlertBadge } from '../../../components/ui/AlertBadge';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { initials } from '../../../lib/format';
import { SEX_LABELS, type Patient } from '../types';

/**
 * Cabecera del expediente, visible en TODAS las pantallas del paciente. Las alertas médicas
 * críticas (alergia a penicilina, anticoagulados…) se muestran con un badge rojo de alta visibilidad (RF-02).
 */
export function PatientHeader({ patient, canEdit }: { patient: Patient; canEdit: boolean }) {
  const critical = patient.alerts.filter((a) => a.severity === 'CRITICAL');
  const warnings = patient.alerts.filter((a) => a.severity === 'WARNING');

  return (
    <header className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-lg font-semibold text-brand-800">
            {initials(patient.fullName)}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{patient.fullName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {patient.age} años · {SEX_LABELS[patient.sex]}
              {patient.documentId ? ` · ${patient.documentId}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {patient.isMinor && <Badge tone="info">Menor de edad</Badge>}
              {!patient.active && <Badge tone="neutral">Inactivo</Badge>}
              {patient.insurance && <Badge tone="brand">{patient.insurance.insurerName}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/agenda?newFor=${patient.id}`}>
            <Button variant="secondary"><Icon name="calendar" className="h-4 w-4" /> Agendar cita</Button>
          </Link>
          {canEdit && (
            <Link to={`/patients/${patient.id}/edit`}>
              <Button variant="secondary">Editar ficha</Button>
            </Link>
          )}
        </div>
      </div>

      {(patient.alerts.length > 0 || !patient.hasMedicalHistory) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4" aria-label="Alertas médicas">
          {critical.map((a) => (
            <AlertBadge key={a.ruleId} level="critical">
              {a.label}
            </AlertBadge>
          ))}
          {warnings.map((a) => (
            <AlertBadge key={a.ruleId} level="warning">
              {a.label}
            </AlertBadge>
          ))}
          {!patient.hasMedicalHistory && (
            <AlertBadge level="warning">Anamnesis pendiente: obligatoria antes de la atención</AlertBadge>
          )}
        </div>
      )}
    </header>
  );
}
