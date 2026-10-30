import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatMoney } from '../../lib/format';
import { errorMessage, useResource } from '../../lib/useResource';
import { useSettings } from '../catalog/SettingsProvider';
import type { Finding, OdontogramData } from '../clinical/odontogram/findings';
import { usePatientRecord } from '../patients/record/PatientRecordLayout';
import { AddItemModal } from './AddItemModal';
import { BudgetSection } from './BudgetSection';
import { ITEM_STATUS_LABELS, ITEM_STATUS_TONE, type Plan } from './types';

/** Plan de tratamiento por fases y sesiones (RF-07), presupuesto y aprobación (RF-08). */
export function PlanTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const toast = useToast();
  const { settings } = useSettings();
  const canEdit = user?.role === 'ODONTOLOGO';

  const loader = useCallback(() => api<Plan[]>(`/patients/${patient.id}/treatment-plans`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);

  const [planId, setPlanId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [phaseName, setPhaseName] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const plan = data?.find((p) => p.id === planId) ?? data?.[0];

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setActionError(null);
    try {
      await action();
      if (success) toast.push('success', success);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  const openAddItem = async () => {
    try {
      const odontogram = await api<OdontogramData>(`/patients/${patient.id}/odontogram`);
      setFindings(odontogram.findings.filter((f) => f.status !== 'DONE' && f.type !== 'SEALANT'));
    } catch {
      setFindings([]);
    }
    setAddingItem(true);
  };

  return (
    <div className="space-y-6">
      {loading && !data && <Spinner />}
      {error && <InlineError>{error}</InlineError>}
      {actionError && <InlineError>{actionError}</InlineError>}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon="file"
            title="Sin plan de tratamiento"
            description="Arme el plan por fases y sesiones a partir de los hallazgos del odontograma."
            action={canEdit && <Button onClick={() => setCreating(true)}>Crear plan</Button>}
          />
        </Card>
      )}

      {plan && data && (
        <>
          <Card
            title={plan.title}
            description="Fases y sesiones del tratamiento."
            action={
              <div className="flex flex-wrap items-center gap-2">
                {data.length > 1 && (
                  <select aria-label="Plan" value={plan.id} onChange={(event) => setPlanId(event.target.value)} className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm">
                    {data.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                )}
                <Badge tone={plan.status === 'ACTIVE' ? 'success' : 'neutral'}>{plan.status === 'ACTIVE' ? 'Activo' : 'Cerrado'}</Badge>
                {canEdit && <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Nuevo plan</Button>}
              </div>
            }
          >
            <div className="space-y-5">
              {plan.phases.map((phase) => (
                <section key={phase.id} aria-label={phase.name}>
                  <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{phase.name}</h3>
                  {phase.items.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Sin ítems en esta fase.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[36rem] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Procedimiento</th>
                            <th className="px-3 py-2">Diente</th>
                            <th className="px-3 py-2">Sesión</th>
                            <th className="px-3 py-2 text-right">Honorarios</th>
                            <th className="px-3 py-2 text-right">Lab.</th>
                            <th className="px-3 py-2">Estado</th>
                            <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {phase.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">{item.procedure.name}</td>
                              <td className="px-3 py-2 tabular-nums">{item.toothCode ?? '—'}</td>
                              <td className="px-3 py-2 tabular-nums">{item.sessionNumber ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.fee, settings.currency)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.labCost, settings.currency)}</td>
                              <td className="px-3 py-2"><Badge tone={ITEM_STATUS_TONE[item.status]}>{ITEM_STATUS_LABELS[item.status]}</Badge></td>
                              <td className="px-3 py-2 text-right">
                                {canEdit && plan.status === 'ACTIVE' && item.status === 'PENDING' && (
                                  <Button variant="ghost" size="sm" onClick={() => void run(() => api(`/treatment-plans/${plan.id}/items/${item.id}/cancel`, { method: 'POST' }), 'Ítem cancelado')}>Cancelar</Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
            {canEdit && plan.status === 'ACTIVE' && (
              <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <Button onClick={() => void openAddItem()}>Agregar ítem</Button>
                <div className="flex items-end gap-2">
                  <div className="w-56"><Field label="Nueva fase" placeholder="Fase 2 — Restauración" value={phaseName} onChange={(event) => setPhaseName(event.target.value)} /></div>
                  <Button variant="secondary" disabled={phaseName.trim().length < 2} onClick={() => void run(async () => { await api(`/treatment-plans/${plan.id}/phases`, { method: 'POST', body: { name: phaseName } }); setPhaseName(''); }, 'Fase agregada')}>Agregar fase</Button>
                </div>
                <Button variant="ghost" className="ml-auto" onClick={() => void run(() => api(`/treatment-plans/${plan.id}/close`, { method: 'POST' }), 'Plan cerrado')}>Cerrar plan</Button>
              </div>
            )}
          </Card>

          <BudgetSection
            planId={plan.id}
            patientName={patient.fullName}
            isMinor={patient.isMinor}
            guardianName={patient.guardian?.fullName}
            canEdit={canEdit}
            onChanged={async () => void (await reload())}
          />

          <AddItemModal
            open={addingItem}
            planId={plan.id}
            phases={plan.phases}
            findings={findings}
            onClose={() => setAddingItem(false)}
            onAdded={async () => {
              setAddingItem(false);
              toast.push('success', 'Ítem agregado al plan');
              await reload();
            }}
          />
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo plan de tratamiento">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const created = await api<Plan>(`/patients/${patient.id}/treatment-plans`, { method: 'POST', body: { title } });
              setPlanId(created.id);
              setTitle('');
              setCreating(false);
            }, 'Plan creado');
          }}
        >
          <Field label="Nombre del plan" placeholder="Rehabilitación completa" value={title} onChange={(event) => setTitle(event.target.value)} />
          <p className="text-xs text-slate-500">Se crea con una primera fase; podrá agregar más fases e ítems.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button type="submit" disabled={title.trim().length < 3}>Crear plan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
