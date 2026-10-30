export interface CashSummaryInput {
  openingFloatCents: number;
  /** Suma de los pagos en efectivo registrados en la sesión. */
  cashPaymentsCents: number;
  /** Efectivo devuelto por anulaciones durante la sesión. */
  refundsCents: number;
  /** Efectivo contado físicamente al cerrar. */
  countedCents: number;
}

export interface CashSummary {
  expectedCents: number;
  /** Contado − esperado: negativo = faltante, positivo = sobrante. */
  differenceCents: number;
}

/** RN-02: se calcula SOLO después de recibir el conteo físico. */
export function computeCashSummary(input: CashSummaryInput): CashSummary {
  const expectedCents = input.openingFloatCents + input.cashPaymentsCents - input.refundsCents;
  return { expectedCents, differenceCents: input.countedCents - expectedCents };
}
