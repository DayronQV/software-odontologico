import { Prisma } from '@prisma/client';
import { scopeConditions } from './finance-reports';
import { money, percent, periodText, type ReportDefinition, type ReportRunner } from './report.types';

/**
 * Agenda: ocupación de sillones, tasa de No-Show y cancelaciones, y efectividad de los recordatorios
 * (ausentismo con y sin recordatorio enviado).
 */
const agenda: ReportRunner = async (db, f) => {
  const rows = await db.$queryRaw<Array<{ office: string; chair: string; total: number; attended: number; noShow: number; canceled: number; booked: number }>>`
    SELECT o."name" AS office, c."name" AS chair, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a."status" = 'ATTENDED')::int AS attended,
      COUNT(*) FILTER (WHERE a."status" = 'NO_SHOW')::int AS "noShow",
      COUNT(*) FILTER (WHERE a."status" = 'CANCELED')::int AS canceled,
      COALESCE(SUM(EXTRACT(EPOCH FROM (a."endAt" - a."startAt")) / 60) FILTER (WHERE a."status" NOT IN ('CANCELED', 'NO_SHOW')), 0)::float AS booked
    FROM "Appointment" a
    JOIN "Chair" c ON c."id" = a."chairId"
    JOIN "Office" o ON o."id" = c."officeId"
    WHERE a."startAt" >= ${f.from} AND a."startAt" < ${f.to}
    ${scopeConditions(f, { professional: 'a."professionalId"', office: 'o."id"' })}
    GROUP BY o."name", c."name" ORDER BY o."name", c."name"`;

  const days = Math.max(1, Math.round((f.to.getTime() - f.from.getTime()) / 86_400_000));
  const availablePerChair = days * (f.closesAtMinute - f.opensAtMinute);
  const out = rows.map((r) => ({
    office: r.office,
    chair: r.chair,
    total: r.total,
    attended: r.attended,
    noShow: r.noShow,
    canceled: r.canceled,
    noShowRate: percent(r.noShow, r.total - r.canceled),
    cancelRate: percent(r.canceled, r.total),
    occupancy: Math.min(100, percent(r.booked, availablePerChair)),
  }));
  const sum = (pick: (r: (typeof out)[number]) => number) => out.reduce((t, r) => t + pick(r), 0);

  // ¿Sirven los recordatorios? Ausentismo entre citas con y sin recordatorio enviado.
  const reminders = await db.$queryRaw<Array<{ withReminder: boolean; total: number; noShow: number }>>`
    SELECT EXISTS (SELECT 1 FROM "NotificationLog" n WHERE n."appointmentId" = a."id" AND n."kind" = 'REMINDER' AND n."status" = 'SENT') AS "withReminder",
           COUNT(*)::int AS total, COUNT(*) FILTER (WHERE a."status" = 'NO_SHOW')::int AS "noShow"
    FROM "Appointment" a
    JOIN "Chair" c ON c."id" = a."chairId"
    WHERE a."startAt" >= ${f.from} AND a."startAt" < ${f.to} AND a."status" <> 'CANCELED'
    ${scopeConditions(f, { professional: 'a."professionalId"', office: 'c."officeId"' })}
    GROUP BY 1`;
  const rate = (flag: boolean) => {
    const found = reminders.find((r) => r.withReminder === flag);
    return found ? percent(found.noShow, found.total) : 0;
  };
  const total = sum((r) => r.total);
  const canceled = sum((r) => r.canceled);
  return {
    key: 'agenda',
    title: 'Agenda: ocupación y ausentismo',
    subtitle: `${periodText(f)} · ocupación sobre el horario de la clínica`,
    columns: [
      { key: 'office', label: 'Consultorio', type: 'text' },
      { key: 'chair', label: 'Sillón', type: 'text' },
      { key: 'total', label: 'Citas', type: 'number' },
      { key: 'attended', label: 'Atendidas', type: 'number' },
      { key: 'noShow', label: 'No asistió', type: 'number' },
      { key: 'canceled', label: 'Canceladas', type: 'number' },
      { key: 'noShowRate', label: 'Tasa de No-Show', type: 'percent' },
      { key: 'cancelRate', label: 'Cancelaciones', type: 'percent' },
      { key: 'occupancy', label: 'Ocupación', type: 'percent' },
    ],
    rows: out,
    totals: {
      office: 'Total',
      total,
      attended: sum((r) => r.attended),
      noShow: sum((r) => r.noShow),
      canceled,
      noShowRate: percent(sum((r) => r.noShow), total - canceled),
      cancelRate: percent(canceled, total),
      occupancy: out.length ? Math.round((sum((r) => r.occupancy) / out.length) * 10) / 10 : 0,
      noShowWithReminder: rate(true),
      noShowWithoutReminder: rate(false),
    },
  };
};

/** Procedimientos más realizados en el período. */
const procedures: ReportRunner = async (db, f) => {
  const rows = await db.$queryRaw<Array<{ name: string; category: string; total: number; patients: number }>>`
    SELECT pr."name", pr."category", COUNT(*)::int AS total, COUNT(DISTINCT r."patientId")::int AS patients
    FROM "ProcedureRecord" r
    JOIN "Procedure" pr ON pr."id" = r."procedureId"
    LEFT JOIN "Professional" p ON p."userId" = r."performedById"
    WHERE r."performedAt" >= ${f.from} AND r."performedAt" < ${f.to}
    ${f.professionalId ? Prisma.sql` AND p."id" = ${f.professionalId}` : Prisma.empty}
    GROUP BY pr."name", pr."category" ORDER BY total DESC, pr."name" LIMIT 50`;
  return {
    key: 'procedures',
    title: 'Procedimientos más realizados',
    subtitle: periodText(f),
    columns: [
      { key: 'name', label: 'Procedimiento', type: 'text' },
      { key: 'category', label: 'Categoría', type: 'text' },
      { key: 'total', label: 'Realizados', type: 'number' },
      { key: 'patients', label: 'Pacientes', type: 'number' },
    ],
    rows,
    totals: { name: 'Total', total: rows.reduce((t, r) => t + r.total, 0) },
  };
};

/** Presupuestos emitidos vs. aprobados (conversión). Las versiones reemplazadas no cuentan como emitidas. */
const budgets: ReportRunner = async (db, f) => {
  const rows = await db.$queryRaw<Array<{ status: string; total: number; amount: number }>>`
    SELECT b."status"::text AS status, COUNT(*)::int AS total, COALESCE(SUM(b."total"), 0)::float AS amount
    FROM "Budget" b
    LEFT JOIN "Professional" p ON p."userId" = b."createdById"
    WHERE b."createdAt" >= ${f.from} AND b."createdAt" < ${f.to} AND b."status" <> 'SUPERSEDED'
    ${f.professionalId ? Prisma.sql` AND p."id" = ${f.professionalId}` : Prisma.empty}
    GROUP BY b."status"`;
  const labels: Record<string, string> = { OPEN: 'Abiertos', PENDING_AUTHORIZATION: 'Descuento por autorizar', PARTIALLY_APPROVED: 'Aprobados parcialmente', APPROVED: 'Aprobados totalmente' };
  const total = rows.reduce((t, r) => t + r.total, 0);
  const approved = rows.filter((r) => r.status === 'APPROVED' || r.status === 'PARTIALLY_APPROVED').reduce((t, r) => t + r.total, 0);
  return {
    key: 'budgets',
    title: 'Presupuestos: emitidos vs. aprobados',
    subtitle: periodText(f),
    columns: [
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'total', label: 'Presupuestos', type: 'number' },
      { key: 'amount', label: 'Importe', type: 'money' },
    ],
    rows: rows.map((r) => ({ status: labels[r.status] ?? r.status, total: r.total, amount: money(r.amount) })),
    totals: { status: 'Total emitidos', total, amount: money(rows.reduce((t, r) => t + r.amount, 0)), conversionRate: percent(approved, total) },
  };
};

export const AGENDA_REPORTS: ReportDefinition[] = [
  { key: 'agenda', title: 'Agenda y ausentismo', description: 'Ocupación de sillones, No-Show, cancelaciones y efectividad de los recordatorios.', dentist: true, run: agenda },
  { key: 'procedures', title: 'Procedimientos más realizados', description: 'Ranking de procedimientos del período.', dentist: true, run: procedures },
  { key: 'budgets', title: 'Presupuestos emitidos vs. aprobados', description: 'Conversión de presupuestos en tratamientos aprobados.', dentist: false, run: budgets },
];
