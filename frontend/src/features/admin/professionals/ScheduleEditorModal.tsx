import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { InlineError } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { clockToMinutes, minutesToClock } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import type { Professional } from '../../catalog/types';
import { WEEKDAYS, WEEK_ORDER } from './schedule-utils';

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

const emptyWeek = (): Record<number, DayRow> =>
  Object.fromEntries(WEEK_ORDER.map((d) => [d, { enabled: false, start: '08:00', end: '18:00' }]));

function fromProfessional(professional: Professional): Record<number, DayRow> {
  const week = emptyWeek();
  for (const slot of professional.schedules) {
    week[slot.weekday] = { enabled: true, start: minutesToClock(slot.startMinute), end: minutesToClock(slot.endMinute) };
  }
  return week;
}

interface Props {
  professional: Professional | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Horario laboral semanal: una franja por día (el sistema admite varias, p. ej. horario partido). */
export function ScheduleEditorModal({ professional, onClose, onSaved }: Props) {
  const toast = useToast();
  const [week, setWeek] = useState<Record<number, DayRow>>(emptyWeek);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (professional) {
      setWeek(fromProfessional(professional));
      setError(null);
    }
  }, [professional]);

  const update = (day: number, patch: Partial<DayRow>) => setWeek((w) => ({ ...w, [day]: { ...w[day], ...patch } }));

  const save = async () => {
    if (!professional) return;
    const slots = WEEK_ORDER.filter((d) => week[d].enabled).map((d) => ({
      weekday: d,
      startMinute: clockToMinutes(week[d].start),
      endMinute: clockToMinutes(week[d].end),
    }));
    if (slots.some((s) => s.endMinute <= s.startMinute)) {
      setError('En cada día, la hora de fin debe ser posterior a la de inicio.');
      return;
    }
    setBusy(true);
    try {
      await api(`/catalog/professionals/${professional.id}/schedule`, { method: 'PUT', body: { slots } });
      toast.push('success', 'Horario actualizado');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!professional} title={`Horario de ${professional?.user.fullName ?? ''}`} onClose={onClose} size="lg">
      <p className="mb-4 text-sm text-slate-500">Las citas solo se pueden agendar dentro de este horario (y del horario de la clínica).</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {WEEK_ORDER.map((day) => {
          const row = week[day];
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex min-h-11 w-36 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-line text-brand-600"
                  checked={row.enabled}
                  onChange={(e) => update(day, { enabled: e.target.checked })}
                />
                <span className="text-sm font-medium text-slate-800">{WEEKDAYS[day]}</span>
              </label>
              {row.enabled ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[day]}: desde`}
                    value={row.start}
                    onChange={(e) => update(day, { start: e.target.value })}
                    className="min-h-11 rounded-lg border border-line px-3 text-sm"
                  />
                  <span className="text-slate-400">a</span>
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[day]}: hasta`}
                    value={row.end}
                    onChange={(e) => update(day, { end: e.target.value })}
                    className="min-h-11 rounded-lg border border-line px-3 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-400">No trabaja</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <div className="mt-4"><InlineError>{error}</InlineError></div>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} loading={busy}>Guardar horario</Button>
      </div>
    </Modal>
  );
}
