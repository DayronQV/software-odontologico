export type ItemStatus = 'PENDING' | 'APPROVED' | 'SCHEDULED' | 'DONE' | 'CANCELED';
export type BudgetStatus = 'PENDING_AUTHORIZATION' | 'OPEN' | 'PARTIALLY_APPROVED' | 'APPROVED' | 'SUPERSEDED';

export interface PlanItem {
  id: string;
  procedure: { id: string; code: string; name: string };
  toothCode: number | null;
  surface: string | null;
  sessionNumber: number | null;
  fee: number;
  labCost: number;
  status: ItemStatus;
  findingId: string | null;
  appointmentId: string | null;
}

export interface PlanPhase {
  id: string;
  name: string;
  position: number;
  items: PlanItem[];
}

export interface Plan {
  id: string;
  patientId: string;
  title: string;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
  phases: PlanPhase[];
  budgets: Array<{ id: string; version: number; status: BudgetStatus; total: number }>;
}

export interface BudgetLine {
  itemId: string;
  description: string;
  toothCode: number | null;
  fee: number;
  labCost: number;
  itemStatus: ItemStatus;
  sessionNumber: number | null;
}

export interface Budget {
  id: string;
  planId: string;
  planTitle: string;
  version: number;
  status: BudgetStatus;
  createdAt: string;
  createdBy: string | null;
  subtotalFees: number;
  subtotalLab: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  discountAuthorization: { by: string | null; at: string; note: string | null } | null;
  phases: Array<{ name: string; position: number; fees: number; lab: number; discount: number; total: number; lines: BudgetLine[] }>;
  approvals: Array<{
    id: string;
    itemIds: string[];
    approvedTotal: number;
    createdAt: string;
    hasPdf: boolean;
    signing: { status: 'PENDING' | 'SIGNED'; method: 'TOUCH' | 'OTP' | null; signerName: string | null; signedAt: string | null };
  }>;
}

export interface Approval {
  id: string;
  budgetId: string;
  signing: { id: string; status: 'PENDING' | 'SIGNED' };
  itemIds: string[];
  approvedTotal: number;
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  SCHEDULED: 'Agendado',
  DONE: 'Realizado',
  CANCELED: 'Cancelado',
};

export const ITEM_STATUS_TONE = { PENDING: 'neutral', APPROVED: 'info', SCHEDULED: 'violet', DONE: 'success', CANCELED: 'danger' } as const;

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  PENDING_AUTHORIZATION: 'Descuento por autorizar',
  OPEN: 'Abierto',
  PARTIALLY_APPROVED: 'Aprobado parcialmente',
  APPROVED: 'Aprobado',
  SUPERSEDED: 'Reemplazado',
};

export const BUDGET_STATUS_TONE = { PENDING_AUTHORIZATION: 'warning', OPEN: 'info', PARTIALLY_APPROVED: 'violet', APPROVED: 'success', SUPERSEDED: 'neutral' } as const;
