/**
 * Puerto de la pasarela de pagos con tarjeta (SRS §7.1: Stripe, dLocal…). El proyecto es educativo
 * y de costo cero: se usa el adaptador simulado. Un adaptador real (p. ej. Stripe en modo test)
 * solo debe implementar esta interfaz.
 */
export interface ChargeRequest {
  /** Monto en la unidad monetaria (no en centavos). */
  amount: number;
  currency: string;
  method: 'CARD_CREDIT' | 'CARD_DEBIT';
  /** Token de la tarjeta generado en el cliente (nunca el número de tarjeta). */
  cardToken?: string;
  /** Referencia interna para conciliación. */
  reference: string;
}

export interface ChargeResult {
  transactionId: string;
  authCode: string;
}

export class PaymentDeclinedError extends Error {
  constructor(message = 'La tarjeta fue rechazada') {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** Revierte un cobro (anulación de comprobante o fallo posterior al cobro). */
  reverse(transactionId: string): Promise<void>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
