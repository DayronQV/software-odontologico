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
  const context: PatientRecordContext = { patient, reload, canEditAnamnesis: true };

  return (
    <>
      <PatientHeader patient={patient} canEdit={user?.role === 'RECEPCIONISTA'} />
      <TabNav
        label="Secciones del expediente"
        items={[
          { to: base, label: 'Resumen' },
          { to: `${base}/anamnesis`, label: 'Anamnesis' },
          { to: `${base}/appointments`, label: 'Citas' },
        ]}
      />
      <Outlet context={context} />
    </>
  );
}

export const usePatientRecord = () => useOutletContext<PatientRecordContext>();
