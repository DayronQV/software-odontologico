import { CARD_METHODS, REFERENCE_METHODS, type PaymentMethod } from '../types';

/** Calcula en centavos enteros, igual que el servidor, para mostrar totales exactos mientras se arma la venta. */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;
const percentOf = (cents: number, percent: number): number => Math.round((cents * percent) / 100);

export interface PosLine {
  key: string;
  procedureId: string | null;
  description: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
}

export interface PosRetention {
  type: 'IVA' | 'RENTA';
  percent: number;
}

export interface PosPayment {
  key: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  cardToken: string;
}

export interface PosTotals {
  grossCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  retentionCents: number;
  payableCents: number;
}

export function calculatePosTotals(lines: PosLine[], taxRatePercent: number, retentions: PosRetention[]): PosTotals {
  let gross = 0;
  let discount = 0;
  let net = 0;
  let tax = 0;
  for (const line of lines) {
    const lineGross = toCents(line.unitPrice) * line.quantity;
    const lineDiscount = percentOf(lineGross, line.discountPercent);
    const lineNet = lineGross - lineDiscount;
    gross += lineGross;
    discount += lineDiscount;
    net += lineNet;
    tax += percentOf(lineNet, taxRatePercent);
  }
  const retentionCents = retentions.reduce((sum, r) => sum + percentOf(r.type === 'IVA' ? tax : net, r.percent), 0);
  return {
    grossCents: gross,
    discountCents: discount,
    netCents: net,
    taxCents: tax,
    totalCents: net + tax,
    retentionCents,
    payableCents: net + tax - retentionCents,
  };
}

export const paidCents = (payments: PosPayment[]): number => payments.reduce((sum, p) => sum + toCents(p.amount || 0), 0);

/** Mensaje de error de los pagos mixtos, o null si ya se puede emitir. */
export function paymentsProblem(payments: PosPayment[], payableCents: number): string | null {
  if (payments.length === 0) return 'Registre al menos un pago';
  for (const p of payments) {
    if (!(p.amount > 0)) return 'Cada pago debe ser mayor a cero';
    if (REFERENCE_METHODS.includes(p.method) && !p.reference.trim()) {
      return p.method === 'TRANSFER' ? 'La transferencia requiere el número de referencia' : 'El seguro requiere el número de autorización';
    }
  }
  const diff = payableCents - paidCents(payments);
  if (diff > 0) return `Faltan ${fromCents(diff).toFixed(2)} para completar el pago`;
  if (diff < 0) return `Los pagos superan el total en ${fromCents(-diff).toFixed(2)}`;
  return null;
}

/** Cuerpo del POST /billing/invoices. Las líneas del catálogo envían el procedimiento; las libres, su precio. */
export function buildInvoicePayload(input: {
  patientId: string;
  lines: PosLine[];
  payments: PosPayment[];
  retentions: PosRetention[];
  notes: string;
}) {
  return {
    patientId: input.patientId,
    lines: input.lines.map((l) =>
      l.procedureId
        ? { procedureId: l.procedureId, quantity: l.quantity, discountPercent: l.discountPercent || undefined }
        : { description: l.description, unitPrice: l.unitPrice, quantity: l.quantity, discountPercent: l.discountPercent || undefined },
    ),
    payments: input.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference.trim() || undefined,
      cardToken: CARD_METHODS.includes(p.method) ? p.cardToken || undefined : undefined,
    })),
    retentions: input.retentions.length > 0 ? input.retentions : undefined,
    notes: input.notes.trim() || undefined,
  };
}
