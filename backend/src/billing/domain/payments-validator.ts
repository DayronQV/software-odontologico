import { PaymentMethod } from '@prisma/client';
import { fromCents } from '../../common/money';

export interface PaymentInput {
  method: PaymentMethod;
  amountCents: number;
  reference?: string | null;
}

/** Medios que dejan una referencia verificable (transferencia, autorización del seguro). */
const REQUIRES_REFERENCE: PaymentMethod[] = [PaymentMethod.TRANSFER, PaymentMethod.INSURANCE];

export const CARD_METHODS: PaymentMethod[] = [PaymentMethod.CARD_CREDIT, PaymentMethod.CARD_DEBIT];

/**
 * RF-12: pagos mixtos. La suma de los pagos debe ser EXACTAMENTE el monto a cobrar.
 * Devuelve un mensaje de error o null si todo es correcto.
 */
export function validatePayments(payments: PaymentInput[], payableCents: number): string | null {
  if (payments.length === 0) return 'Registre al menos un pago';

  for (const payment of payments) {
    if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
      return 'Cada pago debe ser mayor a cero';
    }
    if (REQUIRES_REFERENCE.includes(payment.method) && !payment.reference?.trim()) {
      return payment.method === PaymentMethod.TRANSFER
        ? 'La transferencia requiere el número de referencia'
        : 'El pago con seguro requiere el número de autorización';
    }
  }

  const paid = payments.reduce((total, p) => total + p.amountCents, 0);
  if (paid < payableCents) {
    return `Faltan ${fromCents(payableCents - paid).toFixed(2)} para completar el pago`;
  }
  if (paid > payableCents) {
    return `Los pagos superan el total en ${fromCents(paid - payableCents).toFixed(2)}`;
  }
  return null;
}
