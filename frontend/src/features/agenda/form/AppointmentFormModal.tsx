import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField, TextareaField } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatMoney, toLocalInputValue } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import { useOffices, useProcedures, useProfessionals } from '../../catalog/useCatalog';
import { PatientPicker, type PickedPatient } from '../../patients/PatientPicker';
import {
  buildAppointmentPayload,
  suggestedDuration,
  validateAppointmentForm,
  type AppointmentFormErrors,
} from './appointment-form';

interface SchedulableItem {
  id: string;
  procedure: { id: string; name: string };
  toothCode: number | null;
  sessionNumber: number | null;
  status: 'APPROVED' | 'SCHEDULED';
  planTitle: string;
  phaseName: string;
}

export interface AppointmentFormState {
  start?: Date;
  end?: Date;
  patient?: PickedPatient;
}

interface Props {
  state: AppointmentFormState | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Alta de una cita (RF-09). Si el horario choca (RN-03) la API responde con el recurso ocupado. */
export function AppointmentFormModal({ state, onClose, onSaved }: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const { data: offices } = useOffices();
  const { data: professionals } = useProfessionals();
  const { data: procedures } = useProcedures();

  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [professionalId, setProfessionalId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [chairId, setChairId] = useState('');
  const [procedureIds, setProcedureIds] = useState<string[]>([]);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(30);
  const [durationTouched, setDurationTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setPatient(state.patient ?? null);
    setProfessionalId('');
    setOfficeId('');
    setChairId('');
    setProcedureIds([]);
    setItemIds([]);
    setNotes('');
    setErrors({});
    setServerError(null);
    setDurationTouched(false);
    const startDate = state.start ?? new Date(Date.now() + 60 * 60_000);
    startDate.setSeconds(0, 0);
    setStart(toLocalInputValue(startDate));
    setDuration(state.end && state.start ? Math.max(5, Math.round((state.end.getTime() - state.start.getTime()) / 60_000)) : 30);
    if (state.end && state.start) setDurationTouched(true);
  }, [state]);

  // Tareas agendables (RF-08): ítems del plan que el paciente ya aprobó
  const patientId = patient?.id;
  const itemsLoader = useCallback(
    async () => (patientId ? await api<SchedulableItem[]>(`/patients/${patientId}/schedulable-items`).catch(() => []) : []),
    [patientId],
  );
  const { data: schedulable } = useResource(itemsLoader);

  useEffect(() => {
    setItemIds([]);
  }, [patientId]);

  const toggleItem = (item: SchedulableItem) => {
    const selected = itemIds.includes(item.id);
    setItemIds(selected ? itemIds.filter((id) => id !== item.id) : [...itemIds, item.id]);
    if (!selected && !procedureIds.includes(item.procedure.id)) {
      const next = [...procedureIds, item.procedure.id];
      setProcedureIds(next);
      if (!durationTouched) setDuration(suggestedDuration(procedures ?? [], next));
    }
  };

  const chairs = useMemo(() => (offices ?? []).find((o) => o.id === officeId)?.chairs.filter((c) => c.active) ?? [], [offices, officeId]);

  const toggleProcedure = (id: string) => {
    const next = procedureIds.includes(id) ? procedureIds.filter((p) => p !== id) : [...procedureIds, id];
    setProcedureIds(next);
    if (!durationTouched) setDuration(suggestedDuration(procedures ?? [], next));
  };

  const submit = async () => {
    const values = { patientId: patient?.id ?? '', professionalId, chairId, procedureIds, start, durationMinutes: duration, notes, treatmentItemIds: itemIds };
    const found = validateAppointmentForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      await api('/agenda/appointments', { method: 'POST', body: buildAppointmentPayload(values) });
      toast.push('success', 'Cita agendada. Se envió la confirmación al paciente.');
      onSaved();
      onClose();
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!state} title="Nueva cita" onClose={onClose} size="lg">
      <div className="space-y-5">
        <PatientPicker label="Paciente" value={patient} onChange={setPatient} error={errors.patientId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Profesional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} error={errors.professionalId}>
            <option value="">Seleccione…</option>
            {(professionals ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.user.fullName}{p.specialty ? ` — ${p.specialty}` : ''}</option>
            ))}
          </SelectField>
          <SelectField label="Consultorio" value={officeId} onChange={(e) => { setOfficeId(e.target.value); setChairId(''); }}>
            <option value="">Seleccione…</option>
            {(offices ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <SelectField label="Sillón dental" value={chairId} onChange={(e) => setChairId(e.target.value)} error={errors.chairId} disabled={!officeId}>
            <option value="">{officeId ? 'Seleccione…' : 'Elija primero el consultorio'}</option>
            {chairs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <Field label="Inicio" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} error={errors.start} />
        </div>

        {schedulable && schedulable.length > 0 && (
          <fieldset className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
            <legend className="px-1 text-sm font-medium text-brand-900">Tratamientos aprobados por agendar</legend>
            <ul className="space-y-1">
              {schedulable.map((item) => (
                <li key={item.id}>
                  <label className={`flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 ${item.status === 'SCHEDULED' ? 'opacity-60' : 'cursor-pointer hover:bg-white'}`}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-line text-brand-600"
                      disabled={item.status === 'SCHEDULED'}
                      checked={itemIds.includes(item.id)}
                      onChange={() => toggleItem(item)}
                    />
                    <span className="flex-1 text-sm text-slate-800">
                      {item.procedure.name}{item.toothCode ? ` · diente ${item.toothCode}` : ''}
                      <span className="block text-xs text-slate-500">{item.planTitle} · {item.phaseName}{item.sessionNumber ? ` · sesión ${item.sessionNumber}` : ''}</span>
                    </span>
                    {item.status === 'SCHEDULED' && <span className="text-xs text-slate-500">Ya agendado</span>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Procedimientos</legend>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {(procedures ?? []).map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600" checked={procedureIds.includes(p.id)} onChange={() => toggleProcedure(p.id)} />
                  <span className="flex-1 text-sm text-slate-800">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.durationMinutes} min · {formatMoney(p.basePrice, settings.currency)}</span>
                </label>
              </li>
            ))}
          </ul>
          {errors.procedureIds && <p role="alert" className="mt-1.5 text-sm text-rose-700">{errors.procedureIds}</p>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field
            label="Duración (min)"
            type="number"
            inputMode="numeric"
            value={duration}
            onChange={(e) => { setDuration(Number(e.target.value)); setDurationTouched(true); }}
            error={errors.durationMinutes}
            hint="Se sugiere según los procedimientos."
          />
          <TextareaField label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {serverError && <InlineError>{serverError}</InlineError>}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>Agendar cita</Button>
        </div>
      </div>
    </Modal>
  );
}
