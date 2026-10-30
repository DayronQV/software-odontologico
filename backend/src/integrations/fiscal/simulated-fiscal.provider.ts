import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type {
  FiscalAuthorization,
  FiscalDocument,
  FiscalInvoiceProvider,
} from './fiscal-invoice-provider';

/** Autoriza cualquier documento con un folio y un código de prueba (no tiene validez fiscal). */
@Injectable()
export class SimulatedFiscalProvider implements FiscalInvoiceProvider {
  readonly name = 'SIMULADO';

  async authorize(document: FiscalDocument): Promise<FiscalAuthorization> {
    const stampedAt = new Date();
    const day = stampedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = document.kind === 'INVOICE' ? 'FAC' : 'NC';
    return {
      provider: this.name,
      folio: `SIM-${prefix}-${day}-${String(document.number).padStart(6, '0')}`,
      authorizationCode: String(randomInt(1_000_000_000, 9_999_999_999)),
      stampedAt,
    };
  }
}
