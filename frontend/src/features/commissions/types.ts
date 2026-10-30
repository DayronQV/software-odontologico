export type Mode = 'PERCENT' | 'FIXED_AMOUNT' | 'PERCENT_NET_OF_COSTS';

export const MODE_LABELS: Record<Mode, string> = {
  PERCENT: 'Porcentaje sobre lo cobrado',
  FIXED_AMOUNT: 'Monto fijo por procedimiento',
  PERCENT_NET_OF_COSTS: 'Porcentaje tras laboratorio y materiales',
};

export interface Rule {
  id: string;
  professionalId: string;
  professional: string | null;
  procedureId: string | null;
  procedure: string | null;
  mode: Mode;
  value: number;
  validFrom: string;
  validTo: string | null;
  priority: number;
  active: boolean;
}

export interface Entry {
  id: string;
  createdAt: string;
  professional: string | null;
  procedure: string | null;
  invoiceNumber: number | null;
  kind: 'ACCRUAL' | 'REVERSAL';
  baseAmount: number;
  labCost: number;
  materialsCost: number;
  amount: number;
  settled: boolean;
}

export interface Settlement {
  id: string;
  displayNumber: string;
  professionalId: string;
  professional: string | null;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  total: number;
  paidAt: string | null;
}

export const SETTLEMENT_STATUS = {
  DRAFT: { label: 'Borrador', tone: 'warning' },
  APPROVED: { label: 'Aprobada', tone: 'info' },
  PAID: { label: 'Pagada', tone: 'success' },
} as const;
