import esLocale from '@fullcalendar/core/locales/es';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo } from 'react';
import { minutesToClock } from '../../../lib/format';
import { isReleased, STATUS_META } from '../appointment-status';
import type { Appointment } from '../types';

interface Props {
  appointments: Appointment[];
  opensAtMinute: number;
  closesAtMinute: number;
  /** Si es false (p. ej. odontólogo) no se pueden crear citas arrastrando. */
  canCreate: boolean;
  onRangeChange: (from: Date, to: Date) => void;
  onSelectSlot: (start: Date, end: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}

/** Calendario por día y por semana (RF-09) con eventos de color suave según el estado. */
export function AgendaCalendar({ appointments, opensAtMinute, closesAtMinute, canCreate, onRangeChange, onSelectSlot, onSelectAppointment }: Props) {
  const events = useMemo(
    () =>
      appointments.map((a) => {
        const { event } = STATUS_META[a.status];
        return {
          id: a.id,
          start: a.startAt,
          end: a.endAt,
          title: a.patient.fullName,
          backgroundColor: event.background,
          borderColor: event.border,
          textColor: event.text,
          classNames: isReleased(a.status) ? ['opacity-60', 'line-through'] : [],
          extendedProps: { appointment: a },
        };
      }),
    [appointments],
  );

  return (
    <FullCalendar
      plugins={[timeGridPlugin, interactionPlugin]}
      locales={[esLocale]}
      locale="es"
      initialView="timeGridWeek"
      firstDay={1}
      headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek' }}
      buttonText={{ today: 'Hoy', day: 'Día', week: 'Semana' }}
      allDaySlot={false}
      nowIndicator
      slotDuration="00:15:00"
      slotLabelInterval="01:00"
      slotMinTime={`${minutesToClock(opensAtMinute)}:00`}
      slotMaxTime={`${minutesToClock(closesAtMinute)}:00`}
      slotEventOverlap={false}
      expandRows
      height="auto"
      stickyHeaderDates
      selectable={canCreate}
      selectMirror
      select={(arg: DateSelectArg) => onSelectSlot(arg.start, arg.end)}
      events={events}
      eventClick={(arg: EventClickArg) => onSelectAppointment(arg.event.extendedProps.appointment as Appointment)}
      eventContent={renderEvent}
      datesSet={(arg: DatesSetArg) => onRangeChange(arg.start, arg.end)}
    />
  );
}

function renderEvent(arg: EventContentArg) {
  const a = arg.event.extendedProps.appointment as Appointment;
  return (
    <div className="overflow-hidden px-1.5 py-0.5 text-xs leading-tight">
      <p className="truncate font-semibold">{arg.timeText} · {a.patient.fullName}</p>
      <p className="truncate opacity-80">{a.procedures.map((p) => p.name).join(', ')}</p>
      <p className="truncate opacity-70">{a.chair.name} · {STATUS_META[a.status].label}</p>
    </div>
  );
}
