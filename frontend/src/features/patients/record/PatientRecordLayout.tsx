import { useCallback } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { TabNav } from '../../../components/ui/TabNav';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useResource } from '../../../lib/useResource';
import type { Patient } from '../types';
import { PatientHeader } from './PatientHeader';

export interface PatientRecordContext {
  patient: Patient;
  reload: () => Promise<void>;
  canEditAnamnesis: boolean;
}

/** Expediente del paciente: cabecera con alertas + pestañas (resumen, anamnesis, citas). */
export function PatientRecordLayout() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const loader = useCallback(() => api<Patient>(`/patients/${id}`), [id]);
  const { data: patient, error, loading, reload } = useResource(loader);

  if (loading && !patient) return <Spinner />;
  if (error || !patient) return <InlineError>{error ?? 'Paciente no encontrado'}</InlineError>;

  const base = `/patients/${patient.id}`;
  const clinical = user?.role === 'ODONTOLOGO' || user?.role === 'ASISTENTE';
  const tabs = clinical
    ? [
        { to: base, label: 'Resumen' },
        { to: `${base}/attention`, label: 'Atención' },
        { to: `${base}/odontogram`, label: 'Odontograma' },
        { to: `${base}/perio`, label: 'Periodontograma' },
        { to: `${base}/evolution`, label: 'Evolución' },
        { to: `${base}/consents`, label: 'Consentimientos' },
        { to: `${base}/prescriptions`, label: 'Recetas' },
        { to: `${base}/attachments`, label: 'Adjuntos' },
        { to: `${base}/plan`, label: 'Plan y presupuesto' },
        { to: `${base}/timeline`, label: 'Línea de tiempo' },
        { to: `${base}/anamnesis`, label: 'Anamnesis' },
        { to: `${base}/appointments`, label: 'Citas' },
      ]
    : [
        { to: base, label: 'Resumen' },
        { to: `${base}/anamnesis`, label: 'Anamnesis' },
        { to: `${base}/appointments`, label: 'Citas' },
      ];
  const context: PatientRecordContext = { patient, reload, canEditAnamnesis: true };

  return (
    <>
      <PatientHeader patient={patient} canEdit={user?.role === 'RECEPCIONISTA'} />
      <TabNav label="Secciones del expediente" items={tabs} />
      <Outlet context={context} />
    </>
  );
}

export const usePatientRecord = () => useOutletContext<PatientRecordContext>();
