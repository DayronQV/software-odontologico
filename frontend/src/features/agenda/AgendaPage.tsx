import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { buildQuery } from '../../lib/usePagedList';
import { useResource } from '../../lib/useResource';
import { useSettings } from '../catalog/SettingsProvider';
import { useOffices, useProfessionals } from '../catalog/useCatalog';
import type { PickedPatient } from '../patients/PatientPicker';
import { STATUS_META, STATUS_ORDER } from './appointment-status';
import { AgendaCalendar } from './calendar/AgendaCalendar';
import { AgendaFilters, type AgendaFilterValues } from './calendar/AgendaFilters';
import { AppointmentDetailModal } from './detail/AppointmentDetailModal';
import { AppointmentFormModal, type AppointmentFormState } from './form/AppointmentFormModal';
import type { Appointment } from './types';
import { useAgendaRealtime } from './useAgendaRealtime';

/** Agenda por día y semana, filtrable por consultorio/sillón y profesional (RF-09). */
export function AgendaPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: offices } = useOffices();
  const { data: professionals } = useProfessionals();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<AgendaFilterValues>({ officeId: '', chairId: '', professionalId: '' });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [form, setForm] = useState<AppointmentFormState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isReception = user?.role === 'RECEPCIONISTA';

  // FullCalendar avisa el rango visible en cada actualización: solo se guarda si realmente cambió,
  // de lo contrario cada aviso provocaba otro render y un bucle infinito.
  const changeRange = useCallback(
    (from: Date, to: Date) =>
      setRange((current) => {
        const next = { from: from.toISOString(), to: to.toISOString() };
        return current && current.from === next.from && current.to === next.to ? current : next;
      }),
    [],
  );

  const loader = useCallback(
    () => (range ? api<Appointment[]>(`/agenda/appointments${buildQuery({ ...range, ...filters })}`) : Promise.resolve([] as Appointment[])),
    [range, filters],
  );
  const { data, error, reload } = useResource(loader);
  useAgendaRealtime(reload);

  // Desde la ficha del paciente: /agenda?newFor=<id> abre el formulario con el paciente elegido
  const newFor = params.get('newFor');
  useEffect(() => {
    if (!newFor || !isReception) return;
    let cancelled = false;
    api<{ id: string; fullName: string }>(`/patients/${newFor}`)
      .then((p) => !cancelled && setForm({ patient: { id: p.id, fullName: p.fullName } satisfies PickedPatient }))
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [newFor, isReception, setParams]);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const a of data ?? []) result.set(a.status, (result.get(a.status) ?? 0) + 1);
    return result;
  }, [data]);

  return (
    <>
      <PageHeader
        title="Agenda"
        description={`Citas por sillón y profesional · ${settings.clinicName}`}
        actions={isReception ? <Button onClick={() => setForm({})}><Icon name="plus" className="h-4 w-4" /> Nueva cita</Button> : undefined}
      />

      <Card className="mb-4">
        <AgendaFilters values={filters} offices={offices ?? []} professionals={professionals ?? []} allowProfessionalFilter={user?.role !== 'ODONTOLOGO'} onChange={setFilters} />
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Leyenda de estados">
          {STATUS_ORDER.map((status) => (
            <li key={status}>
              <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}{counts.get(status) ? ` · ${counts.get(status)}` : ''}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {error && <div className="mb-4"><InlineError>{error}</InlineError></div>}
      <Card flush className="overflow-hidden p-2 sm:p-4">
        <AgendaCalendar
          appointments={data ?? []}
          opensAtMinute={settings.opensAtMinute}
          closesAtMinute={settings.closesAtMinute}
          canCreate={isReception}
          onRangeChange={changeRange}
          onSelectSlot={(start, end) => setForm({ start, end })}
          onSelectAppointment={(a) => setSelectedId(a.id)}
        />
      </Card>

      <AppointmentFormModal state={form} onClose={() => setForm(null)} onSaved={() => void reload()} />
      <AppointmentDetailModal appointmentId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </>
  );
}
