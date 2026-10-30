import { Prisma } from '@prisma/client';
import { money, periodText, type ReportDefinition, type ReportFilters, type ReportRunner } from './report.types';

const sumBy = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

/** Corte de caja del período: por sesión, con ingresos por método y la diferencia del cierre ciego. */
const cash: ReportRunner = async (db, f) => {
  const sessions = await db.cashSession.findMany({
    where: { openedAt: { gte: f.from, lt: f.to } },
    orderBy: { openedAt: 'asc' },
    include: { openedBy: { select: { fullName: true } }, _count: { select: { invoices: true } } },
  });
  const payments = await db.payment.groupBy({ by: ['cashSessionId', 'method'], where: { cashSessionId: { in: sessions.map((s) => s.id) } }, _sum: { amount: true } });
  const paid = (sessionId: string, methods: string[]) => money(sumBy(payments.filter((p) => p.cashSessionId === sessionId && methods.includes(p.method)), (p) => Number(p._sum.amount ?? 0)));
  const rows = sessions.map((s) => ({
    openedAt: s.openedAt.toISOString(),
    cashier: s.openedBy.fullName,
    status: s.status === 'OPEN' ? 'Abierta' : 'Cerrada',
    invoices: s._count.invoices,
    cash: paid(s.id, ['CASH']),
    card: paid(s.id, ['CARD_CREDIT', 'CARD_DEBIT']),
    transfer: paid(s.id, ['TRANSFER']),
    insurance: paid(s.id, ['INSURANCE']),
    expectedCash: s.expectedCash === null ? null : money(s.expectedCash),
    countedCash: s.countedCash === null ? null : money(s.countedCash),
    difference: s.difference === null ? null : money(s.difference),
  }));
  return {
    key: 'cash',
    title: 'Corte de caja',
    subtitle: periodText(f),
    columns: [
      { key: 'openedAt', label: 'Apertura', type: 'date' },
      { key: 'cashier', label: 'Cajero', type: 'text' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'invoices', label: 'Comprobantes', type: 'number' },
      { key: 'cash', label: 'Efectivo', type: 'money' },
      { key: 'card', label: 'Tarjeta', type: 'money' },
      { key: 'transfer', label: 'Transferencia', type: 'money' },
      { key: 'insurance', label: 'Seguro', type: 'money' },
      { key: 'expectedCash', label: 'Efectivo esperado', type: 'money' },
      { key: 'countedCash', label: 'Efectivo contado', type: 'money' },
      { key: 'difference', label: 'Diferencia', type: 'money' },
    ],
    rows,
    totals: {
      cashier: 'Total',
      invoices: sumBy(rows, (r) => r.invoices),
      cash: money(sumBy(rows, (r) => r.cash)),
      card: money(sumBy(rows, (r) => r.card)),
      transfer: money(sumBy(rows, (r) => r.transfer)),
      insurance: money(sumBy(rows, (r) => r.insurance)),
      difference: money(sumBy(rows, (r) => r.difference ?? 0)),
    },
  };
};

const GROUPS: Record<string, { label: string; expression: Prisma.Sql }> = {
  professional: { label: 'Profesional', expression: Prisma.sql`COALESCE(u."fullName", 'Sin profesional')` },
  procedure: { label: 'Procedimiento', expression: Prisma.sql`COALESCE(pr."name", l."description")` },
  office: { label: 'Consultorio', expression: Prisma.sql`COALESCE(o."name", 'Sin consultorio')` },
};

/** Condiciones de consultorio/profesional compartidas por las consultas de ingresos y de agenda. */
export function scopeConditions(f: ReportFilters, aliases: { professional: string; office: string }): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (f.professionalId) parts.push(Prisma.sql`${Prisma.raw(aliases.professional)} = ${f.professionalId}`);
  if (f.officeId) parts.push(Prisma.sql`${Prisma.raw(aliases.office)} = ${f.officeId}`);
  return parts.length ? Prisma.sql` AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

/** Ingresos facturados (sin anuladas) por profesional, procedimiento, consultorio o día. */
const revenue: ReportRunner = async (db, f) => {
  const by = f.groupBy ?? 'professional';
  const day = by === 'day';
  const group = day
    ? { label: 'Día', expression: Prisma.sql`to_char(i."createdAt" AT TIME ZONE ${f.timezone}, 'YYYY-MM-DD')` }
    : (GROUPS[by] ?? GROUPS.professional);
  const rows = await db.$queryRaw<Array<{ label: string; invoices: number; net: number; total: number }>>`
    SELECT ${group.expression} AS label,
           COUNT(DISTINCT i."id")::int AS invoices,
           COALESCE(SUM(l."netAmount"), 0)::float AS net,
           COALESCE(SUM(l."lineTotal"), 0)::float AS total
    FROM "InvoiceLine" l
    JOIN "Invoice" i ON i."id" = l."invoiceId"
    LEFT JOIN "Appointment" a ON a."id" = i."appointmentId"
    LEFT JOIN "Professional" p ON p."id" = a."professionalId"
    LEFT JOIN "User" u ON u."id" = p."userId"
    LEFT JOIN "Chair" c ON c."id" = a."chairId"
    LEFT JOIN "Office" o ON o."id" = c."officeId"
    LEFT JOIN "Procedure" pr ON pr."id" = l."procedureId"
    WHERE i."status" = 'ISSUED' AND i."createdAt" >= ${f.from} AND i."createdAt" < ${f.to}
    ${scopeConditions(f, { professional: 'p."id"', office: 'o."id"' })}
    GROUP BY 1
    ORDER BY ${day ? Prisma.sql`1 ASC` : Prisma.sql`total DESC`}`;
  return {
    key: 'revenue',
    title: 'Ingresos',
    subtitle: `${periodText(f)} · por ${group.label.toLowerCase()}`,
    columns: [
      { key: 'label', label: group.label, type: 'text' },
      { key: 'invoices', label: 'Comprobantes', type: 'number' },
      { key: 'net', label: 'Neto', type: 'money' },
      { key: 'total', label: 'Total con impuestos', type: 'money' },
    ],
    rows: rows.map((r) => ({ label: r.label, invoices: r.invoices, net: money(r.net), total: money(r.total) })),
    totals: { label: 'Total', invoices: sumBy(rows, (r) => r.invoices), net: money(sumBy(rows, (r) => r.net)), total: money(sumBy(rows, (r) => r.total)) },
  };
};

/**
 * Cuentas por cobrar: lo que el paciente aprobó (presupuestos firmados) menos lo que ya se le facturó.
 * Es una estimación del saldo pendiente de los tratamientos aprobados.
 */
const receivables: ReportRunner = async (db, f) => {
  const [approved, invoiced] = await Promise.all([
    db.$queryRaw<Array<{ patientId: string; total: number }>>`
      SELECT tp."patientId" AS "patientId", SUM(ba."approvedTotal")::float AS total
      FROM "BudgetApproval" ba
      JOIN "SigningRequest" sr ON sr."id" = ba."signingId" AND sr."status" = 'SIGNED'
      JOIN "Budget" b ON b."id" = ba."budgetId"
      JOIN "TreatmentPlan" tp ON tp."id" = b."planId"
      WHERE sr."signedAt" < ${f.to}
      GROUP BY tp."patientId"`,
    db.$queryRaw<Array<{ patientId: string; total: number }>>`
      SELECT i."patientId" AS "patientId", SUM(i."netTotal")::float AS total
      FROM "Invoice" i WHERE i."status" = 'ISSUED' AND i."createdAt" < ${f.to} GROUP BY i."patientId"`,
  ]);
  const paid = new Map(invoiced.map((r) => [r.patientId, r.total]));
  const open = approved.map((r) => ({ patientId: r.patientId, approved: r.total, invoiced: paid.get(r.patientId) ?? 0 })).filter((r) => r.approved - r.invoiced > 0.005);
  const patients = await db.patient.findMany({ where: { id: { in: open.map((r) => r.patientId) } }, select: { id: true, firstName: true, lastName: true } });
  const names = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const rows = open
    .map((r) => ({ patient: names.get(r.patientId) ?? '—', approved: money(r.approved), invoiced: money(r.invoiced), balance: money(r.approved - r.invoiced) }))
    .sort((a, b) => b.balance - a.balance);
  return {
    key: 'receivables',
    title: 'Cuentas por cobrar',
    subtitle: `Saldos de tratamientos aprobados al ${f.toLabel}`,
    columns: [
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'approved', label: 'Aprobado', type: 'money' },
      { key: 'invoiced', label: 'Facturado', type: 'money' },
      { key: 'balance', label: 'Saldo', type: 'money' },
    ],
    rows,
    totals: { patient: 'Total', approved: money(sumBy(rows, (r) => r.approved)), invoiced: money(sumBy(rows, (r) => r.invoiced)), balance: money(sumBy(rows, (r) => r.balance)) },
  };
};

/** Honorarios: comisiones devengadas, liquidadas y pendientes por profesional en el período. */
const fees: ReportRunner = async (db, f) => {
  const rows = await db.$queryRaw<Array<{ name: string; accrued: number; reversed: number; settled: number; pending: number }>>`
    SELECT COALESCE(u."fullName", '—') AS name,
      COALESCE(SUM(e."amount") FILTER (WHERE e."kind" = 'ACCRUAL'), 0)::float AS accrued,
      COALESCE(-SUM(e."amount") FILTER (WHERE e."kind" = 'REVERSAL'), 0)::float AS reversed,
      COALESCE(SUM(e."amount") FILTER (WHERE e."settlementId" IS NOT NULL), 0)::float AS settled,
      COALESCE(SUM(e."amount") FILTER (WHERE e."settlementId" IS NULL), 0)::float AS pending
    FROM "CommissionEntry" e
    JOIN "Professional" p ON p."id" = e."professionalId"
    JOIN "User" u ON u."id" = p."userId"
    WHERE e."createdAt" >= ${f.from} AND e."createdAt" < ${f.to}
    ${f.professionalId ? Prisma.sql` AND p."id" = ${f.professionalId}` : Prisma.empty}
    GROUP BY u."fullName" ORDER BY accrued DESC`;
  const out = rows.map((r) => ({ professional: r.name, accrued: money(r.accrued), reversed: money(r.reversed), net: money(r.accrued - r.reversed), settled: money(r.settled), pending: money(r.pending) }));
  return {
    key: 'fees',
    title: 'Honorarios',
    subtitle: periodText(f),
    columns: [
      { key: 'professional', label: 'Profesional', type: 'text' },
      { key: 'accrued', label: 'Devengado', type: 'money' },
      { key: 'reversed', label: 'Revertido', type: 'money' },
      { key: 'net', label: 'Neto', type: 'money' },
      { key: 'settled', label: 'Liquidado', type: 'money' },
      { key: 'pending', label: 'Pendiente de liquidar', type: 'money' },
    ],
    rows: out,
    totals: { professional: 'Total', accrued: money(sumBy(out, (r) => r.accrued)), reversed: money(sumBy(out, (r) => r.reversed)), net: money(sumBy(out, (r) => r.net)), settled: money(sumBy(out, (r) => r.settled)), pending: money(sumBy(out, (r) => r.pending)) },
  };
};

export const FINANCE_REPORTS: ReportDefinition[] = [
  { key: 'cash', title: 'Corte de caja', description: 'Sesiones de caja, ingresos por método de pago y diferencias del cierre ciego.', dentist: false, run: cash },
  { key: 'revenue', title: 'Ingresos', description: 'Ingresos por profesional, procedimiento, consultorio o día.', dentist: true, run: revenue },
  { key: 'receivables', title: 'Cuentas por cobrar', description: 'Saldos de tratamientos aprobados y pendientes de facturar.', dentist: false, run: receivables },
  { key: 'fees', title: 'Honorarios', description: 'Comisiones devengadas, liquidadas y pendientes por profesional.', dentist: false, run: fees },
];
