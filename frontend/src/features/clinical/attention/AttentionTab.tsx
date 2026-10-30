import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { InlineNotice } from '../../../components/ui/Feedback';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errorMessage } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { NewNote } from '../notes/EvolutionTab';
import { VitalsPanel } from '../notes/VitalsPanel';
import { OdontogramTab } from '../odontogram/OdontogramTab';

/**
 * Pantalla de atención junto al sillón (tablet ≥ 10,5"): al pasar la cita a «En atención» se abre con los
 * signos vitales, el odontograma y una nota SOEP nueva. Todo en una sola vista, con controles táctiles amplios.
 */
export function AttentionTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const appointmentId = params.get('appointment') ?? undefined;
  const [finishing, setFinishing] = useState(false);

  const base = `/patients/${patient.id}`;
  const isDentist = user?.role === 'ODONTOLOGO';

  const finish = async () => {
    if (!appointmentId) return;
    setFinishing(true);
    try {
      await api(`/agenda/appointments/${appointmentId}/status`, { method: 'POST', body: { to: 'ATTENDED' } });
      toast.push('success', 'Atención finalizada: la cita quedó como atendida');
    } catch (e) {
      toast.push('error', errorMessage(e));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {appointmentId ? (
        <InlineNotice>
          Atención en curso. Registre los signos vitales, revise el odontograma y escriba la nota de evolución.
        </InlineNotice>
      ) : (
        <InlineNotice>Abra esta pantalla desde una cita «En atención» para vincular lo que registre a la cita.</InlineNotice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <VitalsPanel patientId={patient.id} appointmentId={appointmentId} canRecord />
          <Card title={isDentist ? 'Nota de evolución (SOEP)' : 'Nota clínica del asistente'}>
            <NewNote patientId={patient.id} appointmentId={appointmentId} assistant={!isDentist} onSaved={async () => toast.push('success', 'Nota guardada')} />
          </Card>
        </div>
        <OdontogramTab compact />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4">
        <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-2">
          <Link to={`${base}/evolution?appointment=${appointmentId ?? ''}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Ver evolución</Link>
          <Link to={`${base}/consents`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Consentimientos</Link>
          {isDentist && <Link to={`${base}/prescriptions?appointment=${appointmentId ?? ''}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Recetar</Link>}
          <Link to={`${base}/plan`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Plan y presupuesto</Link>
        </nav>
        {appointmentId && <Button loading={finishing} onClick={() => void finish()}>Finalizar atención</Button>}
      </div>
    </div>
  );
}
