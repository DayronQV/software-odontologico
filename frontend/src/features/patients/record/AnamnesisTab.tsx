import { useCallback, useEffect, useState } from 'react';
import { AlertBadge } from '../../../components/ui/AlertBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { CheckboxField, TextareaField } from '../../../components/ui/Field';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { TagInput } from '../../../components/ui/TagInput';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage, useResource } from '../../../lib/useResource';
import type { MedicalHistory, MedicalHistoryResponse } from '../types';
import { usePatientRecord } from './PatientRecordLayout';

const EMPTY: MedicalHistory = {
  systemicDiseases: [],
  drugAllergies: [],
  coagulopathies: [],
  surgicalHistory: '',
  currentMedication: '',
  anticoagulated: false,
};

/** Anamnesis (RF-02): obligatoria antes de la atención. Una lista vacía significa "refiere ninguno". */
export function AnamnesisTab() {
  const { patient, reload: reloadPatient } = usePatientRecord();
  const toast = useToast();
  const loader = useCallback(() => api<MedicalHistoryResponse>(`/patients/${patient.id}/medical-history`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);
  const [form, setForm] = useState<MedicalHistory>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data.history, surgicalHistory: data.history?.surgicalHistory ?? '', currentMedication: data.history?.currentMedication ?? '' });
  }, [data]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/patients/${patient.id}/medical-history`, {
        method: 'PUT',
        body: { ...form, surgicalHistory: form.surgicalHistory || undefined, currentMedication: form.currentMedication || undefined },
      });
      toast.push('success', 'Anamnesis guardada');
      await Promise.all([reload(), reloadPatient()]);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error && <InlineError>{error}</InlineError>}
      {!patient.hasMedicalHistory && (
        <InlineNotice>
          Registre la anamnesis para habilitar la atención clínica. Si el paciente no refiere nada, deje las listas vacías y guarde.
        </InlineNotice>
      )}

      {data && data.alerts.length > 0 && (
        <Card title="Alertas generadas" description="Se muestran en la cabecera del expediente.">
          <div className="flex flex-wrap gap-2">
            {data.alerts.map((a) => (
              <AlertBadge key={a.ruleId} level={a.severity === 'CRITICAL' ? 'critical' : 'warning'}>
                {a.label}{a.detail ? ` — ${a.detail}` : ''}
              </AlertBadge>
            ))}
          </div>
        </Card>
      )}

      <Card title="Historial médico general" description="Los datos de la anamnesis se guardan cifrados.">
        <div className="space-y-5">
          <TagInput label="Alergias a fármacos" placeholder="Penicilina, ibuprofeno… (Enter para agregar)" value={form.drugAllergies} onChange={(v) => setForm({ ...form, drugAllergies: v })} />
          <TagInput label="Enfermedades sistémicas" placeholder="Diabetes, hipertensión…" value={form.systemicDiseases} onChange={(v) => setForm({ ...form, systemicDiseases: v })} />
          <TagInput label="Coagulopatías" placeholder="Hemofilia, enfermedad de von Willebrand…" value={form.coagulopathies} onChange={(v) => setForm({ ...form, coagulopathies: v })} />
          <CheckboxField label="Paciente anticoagulado" hint="Toma warfarina, rivaroxabán u otro anticoagulante." checked={form.anticoagulated} onChange={(e) => setForm({ ...form, anticoagulated: e.target.checked })} />
          <TextareaField label="Antecedentes quirúrgicos" value={form.surgicalHistory ?? ''} onChange={(e) => setForm({ ...form, surgicalHistory: e.target.value })} />
          <TextareaField label="Medicación actual" value={form.currentMedication ?? ''} onChange={(e) => setForm({ ...form, currentMedication: e.target.value })} />
        </div>
      </Card>

      {saveError && <InlineError>{saveError}</InlineError>}
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Guardar anamnesis</Button>
      </div>
    </div>
  );
}
