import { Prisma } from '@prisma/client';

export const PLAN_INCLUDE = {
  phases: {
    orderBy: { position: 'asc' },
    include: {
      items: {
        orderBy: [{ sessionNumber: 'asc' }, { createdAt: 'asc' }],
        include: { procedure: { select: { id: true, code: true, name: true } } },
      },
    },
  },
  budgets: {
    orderBy: { version: 'desc' },
    select: { id: true, version: true, status: true, total: true },
  },
} satisfies Prisma.TreatmentPlanInclude;

export type PlanRow = Prisma.TreatmentPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

export function toPlanView(plan: PlanRow) {
  return {
    id: plan.id,
    patientId: plan.patientId,
    title: plan.title,
    status: plan.status,
    createdAt: plan.createdAt,
    phases: plan.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      position: phase.position,
      items: phase.items.map((item) => ({
        id: item.id,
        procedure: item.procedure,
        toothCode: item.toothCode,
        surface: item.surface,
        sessionNumber: item.sessionNumber,
        fee: item.fee,
        labCost: item.labCost,
        status: item.status,
        findingId: item.findingId,
        appointmentId: item.appointmentId,
      })),
    })),
    budgets: plan.budgets,
  };
}
