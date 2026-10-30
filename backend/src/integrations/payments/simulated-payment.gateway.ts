import { Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import {
  PaymentDeclinedError,
  type ChargeRequest,
  type ChargeResult,
  type PaymentGateway,
} from './payment-gateway';

/** Tokens de prueba (igual que las tarjetas de prueba de las pasarelas reales). */
export const TEST_TOKEN_DECLINED = 'tok_declined';
export const TEST_TOKEN_ERROR = 'tok_error';

@Injectable()
export class SimulatedPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(SimulatedPaymentGateway.name);

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.cardToken === TEST_TOKEN_DECLINED) throw new PaymentDeclinedError();
    if (request.cardToken === TEST_TOKEN_ERROR) throw new Error('Pasarela no disponible');
    const result = {
      transactionId: `sim_${randomUUID()}`,
      authCode: String(randomInt(100_000, 999_999)),
    };
    this.logger.log(`Cobro simulado ${request.reference}: ${request.amount} ${request.currency}`);
    return result;
  }

  async reverse(transactionId: string): Promise<void> {
    this.logger.log(`Reversión simulada de ${transactionId}`);
  }
}
