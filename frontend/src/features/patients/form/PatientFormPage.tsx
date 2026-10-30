import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import type { Paged } from '../../../lib/usePagedList';
import { errorMessage, useResource } from '../../../lib/useResource';
import type { Insurer } from '../../catalog/types';
import type { Patient } from '../types';
import { EMPTY_PATIENT_FORM, formToPayload, patientToForm } from './patient-form-mapper';
import { isMinorBirthDate, patientFormSchema, type PatientFormValues } from './patient-schema';
import { ContactSection, EmergencySection, GuardianSection, InsuranceSection, PersonalSection } from './sections';

/** Alta y edición de la ficha única del paciente (RF-01). */
export function PatientFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const patientLoader = useCallback(() => (id ? api<Patient>(`/patients/${id}`) : Promise.resolve(null)), [id]);
  const { data: patient, loading: loadingPatient, error: loadError } = useResource(patientLoader);
  const insurersLoader = useCallback(async () => (await api<Paged<Insurer>>('/catalog/insurers?active=true&pageSize=200')).items, []);
  const { data: insurers } = useResource(insurersLoader);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({ resolver: zodResolver(patientFormSchema), defaultValues: EMPTY_PATIENT_FORM });

  useEffect(() => {
    if (patient) reset(patientToForm(patient));
  }, [patient, reset]);

  const birthDate = useWatch({ control, name: 'birthDate' });
  const minor = isMinorBirthDate(birthDate ?? '');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const payload = formToPayload(values);
      const saved = editing
        ? await api<Patient>(`/patients/${id}`, { method: 'PATCH', body: payload })
        : await api<Patient>('/patients', { method: 'POST', body: payload });
      toast.push('success', editing ? 'Ficha actualizada' : 'Paciente registrado');
      // Tras el alta se lleva a la anamnesis: es obligatoria antes de la atención clínica
      navigate(editing ? `/patients/${saved.id}` : `/patients/${saved.id}/anamnesis`);
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  if (editing && loadingPatient && !patient) return <Spinner />;

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={editing ? `Editar ficha de ${patient?.fullName ?? ''}` : 'Nuevo paciente'}
        description="Ficha única del paciente. Los datos sensibles se guardan cifrados."
      />
      {loadError && <InlineError>{loadError}</InlineError>}
      <PersonalSection register={register} errors={errors} />
      <ContactSection register={register} errors={errors} />
      <EmergencySection register={register} errors={errors} />
      <GuardianSection register={register} errors={errors} isMinor={minor} />
      <InsuranceSection register={register} errors={errors} insurers={insurers ?? []} />

      {serverError && <InlineError>{serverError}</InlineError>}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="secondary" onClick={() => navigate(editing ? `/patients/${id}` : '/patients')}>Cancelar</Button>
        <Button type="submit" loading={isSubmitting}>{editing ? 'Guardar cambios' : 'Registrar paciente'}</Button>
      </div>
    </form>
  );
}
