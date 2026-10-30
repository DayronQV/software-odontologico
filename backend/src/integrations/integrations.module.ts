import { Module } from '@nestjs/common';
import { FISCAL_INVOICE_PROVIDER } from './fiscal/fiscal-invoice-provider';
import { SimulatedFiscalProvider } from './fiscal/simulated-fiscal.provider';
import { EmailChannel } from './messaging/email.channel';
import { MESSAGING_CHANNELS } from './messaging/messaging-channel';
import { SimulatedSmsChannel, SimulatedWhatsAppChannel } from './messaging/simulated-channels';
import { PAYMENT_GATEWAY } from './payments/payment-gateway';
import { SimulatedPaymentGateway } from './payments/simulated-payment.gateway';

/**
 * Integraciones externas del SRS §7.1, todas detrás de una interfaz. Para pasar a un proveedor real
 * se cambia únicamente el `useClass` correspondiente.
 */
@Module({
  providers: [
    SimulatedFiscalProvider,
    SimulatedPaymentGateway,
    SimulatedWhatsAppChannel,
    SimulatedSmsChannel,
    EmailChannel,
    { provide: FISCAL_INVOICE_PROVIDER, useExisting: SimulatedFiscalProvider },
    { provide: PAYMENT_GATEWAY, useExisting: SimulatedPaymentGateway },
    {
      provide: MESSAGING_CHANNELS,
      useFactory: (...channels: unknown[]) => channels,
      inject: [SimulatedWhatsAppChannel, SimulatedSmsChannel, EmailChannel],
    },
  ],
  exports: [FISCAL_INVOICE_PROVIDER, PAYMENT_GATEWAY, MESSAGING_CHANNELS],
})
export class IntegrationsModule {}
