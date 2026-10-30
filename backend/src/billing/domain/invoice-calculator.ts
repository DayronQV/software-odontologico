import { percentOf } from '../../common/money';

export interface LineInput {
  unitPriceCents: number;
  quantity: number;
  discountPercent: number;
}

export type RetentionKind = 'IVA' | 'RENTA';

export interface RetentionInput {
  type: RetentionKind;
  percent: number;
}

export interface LineTotals {
  grossCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
}

export interface RetentionTotals extends RetentionInput {
  amountCents: number;
}

export interface InvoiceTotals {
  lines: LineTotals[];
  grossCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  retentions: RetentionTotals[];
  retentionCents: number;
  /** Lo que realmente se cobra: total − retenciones. */
  payableCents: number;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

/**
 * Totales de un comprobante, siempre en centavos enteros (sin errores de coma flotante).
 * Por línea: bruto = precio × cantidad; descuento = % del bruto; impuesto = tasa sobre el neto.
 * Retenciones: IVA sobre el impuesto, RENTA sobre el neto (cálculo simulado).
 */
export function calculateInvoice(
  lines: LineInput[],
  taxRatePercent: number,
  retentions: RetentionInput[] = [],
): InvoiceTotals {
  const lineTotals: LineTotals[] = lines.map((line) => {
    const grossCents = line.unitPriceCents * line.quantity;
    const discountCents = percentOf(grossCents, line.discountPercent);
    const netCents = grossCents - discountCents;
    const taxCents = percentOf(netCents, taxRatePercent);
    return { grossCents, discountCents, netCents, taxCents, totalCents: netCents + taxCents };
  });

  const grossCents = sum(lineTotals.map((l) => l.grossCents));
  const discountCents = sum(lineTotals.map((l) => l.discountCents));
  const netCents = sum(lineTotals.map((l) => l.netCents));
  const taxCents = sum(lineTotals.map((l) => l.taxCents));
  const totalCents = netCents + taxCents;

  const retentionTotals: RetentionTotals[] = retentions.map((r) => ({
    ...r,
    amountCents: percentOf(r.type === 'IVA' ? taxCents : netCents, r.percent),
  }));
  const retentionCents = sum(retentionTotals.map((r) => r.amountCents));

  return {
    lines: lineTotals,
    grossCents,
    discountCents,
    netCents,
    taxCents,
    totalCents,
    retentions: retentionTotals,
    retentionCents,
    payableCents: totalCents - retentionCents,
  };
}
