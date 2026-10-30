export type PaymentMethod = 'CASH' | 'CARD_CREDIT' | 'CARD_DEBIT' | 'TRANSFER' | 'INSURANCE';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD_CREDIT: 'Tarjeta de crédito',
  CARD_DEBIT: 'Tarjeta de débito',
  TRANSFER: 'Transferencia',
  INSURANCE: 'Seguro',
};

export const CARD_METHODS: PaymentMethod[] = ['CARD_CREDIT', 'CARD_DEBIT'];
export const REFERENCE_METHODS: PaymentMethod[] = ['TRANSFER', 'INSURANCE'];

export interface InvoiceListItem {
  id: string;
  number: number;
  displayNumber: string;
  status: 'ISSUED' | 'VOIDED';
  createdAt: string;
  patientName: string;
  currency: string;
  total: number;
  payableTotal: number;
  fiscalStatus: 'AUTHORIZED' | 'PENDING';
  methods: PaymentMethod[];
}

export interface InvoiceDetail {
  id: string;
  number: number;
  displayNumber: string;
  status: 'ISSUED' | 'VOIDED';
  createdAt: string;
  issuedBy: string;
  patient: { id: string; fullName: string; documentId: string | null };
  currency: string;
  taxRatePercent: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  retentionTotal: number;
  payableTotal: number;
  notes: string | null;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
  }>;
  payments: Array<{ id: string; method: PaymentMethod; amount: number; reference: string | null; authCode: string | null }>;
  retentions: Array<{ type: 'IVA' | 'RENTA'; percent: number; amount: number }>;
  fiscal: {
    status: 'AUTHORIZED' | 'PENDING';
    provider: string | null;
    folio: string | null;
    authorizationCode: string | null;
    stampedAt: string | null;
    error: string | null;
  };
  void: {
    voidedAt: string;
    reason: string | null;
    creditNote: { displayNumber: string; total: number; fiscalFolio: string | null } | null;
  } | null;
}

/** Vista de la caja abierta SIN ningún total del sistema (RN-02). */
export interface BlindCashSession {
  id: string;
  status: 'OPEN';
  openedAt: string;
  openingFloat: number;
  invoiceCount: number;
}

export interface CashCloseResult {
  id: string;
  status: 'CLOSED';
  openedAt: string;
  closedAt: string;
  openingFloat: number;
  countedCash: number;
  expectedCash: number;
  difference: number;
}

export interface CashSessionRow {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  countedCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  invoiceCount: number;
}

export interface CashReport {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  payments: Array<{ method: PaymentMethod; count: number; total: number }>;
  invoicesIssued: number;
  invoicesVoided: number;
  cashRefunds: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  closeNotes: string | null;
}
