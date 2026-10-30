import { Prisma } from '@prisma/client';
import { fromCents, toCents } from '../../common/money';
import { calculateBudget } from '../domain/budget-calculator';

export const BUDGET_INCLUDE = {
  plan: { select: { patientId: true, title: true } },
  lines: {
    orderBy: [{ phasePosition: 'asc' }, { description: 'asc' }],
    include: { item: { select: { status: true, sessionNumber: true } } },
  },
  approvals: {
    orderBy: { createdAt: 'desc' },
    include: { signing: { select: { status: true, method: true, signerName: true, signedAt: true } } },
  },
} satisfies Prisma.BudgetInclude;

export type BudgetRow = Prisma.BudgetGetPayload<{ include: typeof BUDGET_INCLUDE }>;

export const budgetLineInputs = (row: BudgetRow) =>
  row.lines.map((line) => ({
    itemId: line.itemId,
    phasePosition: line.phasePosition,
    phaseName: line.phaseName,
    feeCents: toCents(Number(line.fee)),
    labCents: toCents(Number(line.labCost)),
  }));

export function toBudgetView(row: BudgetRow, names: Map<string, string>) {
  const totals = calculateBudget(budgetLineInputs(row), Number(row.discountPercent));
  const money = (cents: number) => fromCents(cents);
  return {
    id: row.id,
    planId: row.planId,
    patientId: row.plan.patientId,
    planTitle: row.plan.title,
    version: row.version,
    status: row.status,
    createdAt: row.createdAt,
    createdBy: names.get(row.createdById) ?? null,
    subtotalFees: row.subtotalFees,
    subtotalLab: row.subtotalLab,
    discountPercent: row.discountPercent,
    discountAmount: row.discountAmount,
    total: row.total,
    discountAuthorization: row.discountAuthorizedAt
      ? {
          by: row.discountAuthorizedById ? (names.get(row.discountAuthorizedById) ?? null) : null,
          at: row.discountAuthorizedAt,
          note: row.discountAuthorizationNote,
        }
      : null,
    phases: totals.phases.map((phase) => ({
      name: phase.name,
      position: phase.position,
      fees: money(phase.feesCents),
      lab: money(phase.labCents),
      discount: money(phase.discountCents),
      total: money(phase.totalCents),
      lines: row.lines
        .filter((line) => line.phasePosition === phase.position)
        .map((line) => ({
          itemId: line.itemId,
          description: line.description,
          toothCode: line.toothCode,
          fee: line.fee,
          labCost: line.labCost,
          itemStatus: line.item.status,
          sessionNumber: line.item.sessionNumber,
        })),
    })),
    approvals: row.approvals.map((approval) => ({
      id: approval.id,
      itemIds: approval.itemIds,
      approvedTotal: approval.approvedTotal,
      createdAt: approval.createdAt,
      signing: approval.signing,
      hasPdf: !!approval.pdfKey,
    })),
  };
}
