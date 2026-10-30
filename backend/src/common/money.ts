/**
 * El dinero se calcula siempre en centavos enteros para evitar errores de coma flotante
 * (0.1 + 0.2 ≠ 0.3) y se guarda como Decimal(12,2).
 */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

/** Porcentaje de una cantidad en centavos, redondeado al centavo. */
export const percentOf = (cents: number, percent: number): number =>
  Math.round((cents * percent) / 100);
