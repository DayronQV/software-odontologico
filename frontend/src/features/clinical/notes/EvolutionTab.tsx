import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { ProceduresPanel } from '../procedures/ProceduresPanel';
import { NoteCard } from './NoteCard';
import { NoteForm } from './NoteForm';
import type { EvolutionNote } from './notes-types';
import { VitalsPanel } from './VitalsPanel';

/** Nueva nota SOEP: el formulario y su envío, reutilizable en la pantalla de atención. */
export function NewNote({ patientId, appointmentId, assistant, onSaved }: { patientId: string; appointmentId?: string; assistant: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  return (
    <NoteForm
      assistant={assistant}
      submitLabel={assistant ? 'Guardar nota clínica' : 'Guardar nota SOEP'}
      onSubmit={async (values) => {
        await api(`/patients/${patientId}/notes`, { method: 'POST', body: { ...values, appointmentId } });
        toast.push('success', 'Nota registrada');
        await onSaved();
      }}
    />
  );
}

/** Evolución clínica (RF-05): bitácora cronológica inmutable de notas SOEP, adendas, signos vitales y procedimientos. */
export function EvolutionTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const appointmentId = params.get('appointment') ?? undefined;
  const [composing, setComposing] = useState(false);

  const loader = useCallback(() => api<EvolutionNote[]>(`/patients/${patient.id}/notes`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);
  const assistant = user?.role === 'ASISTENTE';

  return (
    <div className="space-y-6">
      <VitalsPanel patientId={patient.id} appointmentId={appointmentId} canRecord />

      <Card
        title="Bitácora de evolución"
        description="Las notas no se borran. Se editan solo dentro del plazo y después se corrigen con una adenda firmada."
        action={!composing && <Button onClick={() => setComposing(true)}>Nueva nota</Button>}
      >
        {composing && (
          <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <NewNote
              patientId={patient.id}
              appointmentId={appointmentId}
              assistant={assistant}
              onSaved={async () => {
                setComposing(false);
                await reload();
              }}
            />
          </div>
        )}
        {loading && !data && <Spinner />}
        {error && <InlineError>{error}</InlineError>}
        {data && data.length === 0 && !composing && (
          <EmptyState icon="file" title="Sin notas de evolución" description="Registre la primera nota de la atención." />
        )}
        <div className="space-y-4">
          {data?.map((note) => (
            <NoteCard key={note.id} note={note} userId={user?.id ?? ''} onChanged={reload} />
          ))}
        </div>
      </Card>

      <ProceduresPanel patientId={patient.id} appointmentId={appointmentId} />
    </div>
  );
}
