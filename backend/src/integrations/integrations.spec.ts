import { ContactChannel } from '@prisma/client';
import { SimulatedFiscalProvider } from './fiscal/simulated-fiscal.provider';
import { SimulatedSmsChannel, SimulatedWhatsAppChannel } from './messaging/simulated-channels';
import { PaymentDeclinedError } from './payments/payment-gateway';
import {
  SimulatedPaymentGateway,
  TEST_TOKEN_DECLINED,
  TEST_TOKEN_ERROR,
} from './payments/simulated-payment.gateway';

describe('integraciones simuladas (costo cero)', () => {
  it('la facturación fiscal devuelve folio, código de autorización y fecha de timbrado', async () => {
    const auth = await new SimulatedFiscalProvider().authorize({
      kind: 'INVOICE',
      number: 42,
      issuedAt: new Date(),
      currency: 'USD',
      netTotal: 100,
      taxTotal: 12,
      total: 112,
      buyer: { name: 'Carlos Mendoza' },
    });
    expect(auth.provider).toBe('SIMULADO');
    expect(auth.folio).toMatch(/^SIM-FAC-\d{8}-000042$/);
    expect(auth.authorizationCode).toMatch(/^\d{10}$/);
    expect(auth.stampedAt).toBeInstanceOf(Date);
  });

  it('las notas de crédito usan su propio prefijo', async () => {
    const auth = await new SimulatedFiscalProvider().authorize({
      kind: 'CREDIT_NOTE', number: 3, issuedAt: new Date(), currency: 'USD', netTotal: 1, taxTotal: 0, total: 1, buyer: { name: 'X' },
    });
    expect(auth.folio).toMatch(/^SIM-NC-/);
  });

  it('la pasarela aprueba cobros y rechaza los tokens de prueba', async () => {
    const gateway = new SimulatedPaymentGateway();
    const request = { amount: 10, currency: 'USD', method: 'CARD_CREDIT' as const, reference: 'r1' };

    const ok = await gateway.charge({ ...request, cardToken: 'tok_visa' });
    expect(ok.transactionId).toMatch(/^sim_/);
    expect(ok.authCode).toMatch(/^\d{6}$/);
    await expect(gateway.charge({ ...request, cardToken: TEST_TOKEN_DECLINED })).rejects.toBeInstanceOf(PaymentDeclinedError);
    await expect(gateway.charge({ ...request, cardToken: TEST_TOKEN_ERROR })).rejects.toThrow('no disponible');
    await expect(gateway.reverse(ok.transactionId)).resolves.toBeUndefined();
  });

  it('WhatsApp y SMS simulados devuelven un identificador de mensaje', async () => {
    const message = { to: '+593 99 123 4567', subject: 'Hola', body: 'Texto' };
    const whatsapp = new SimulatedWhatsAppChannel();
    const sms = new SimulatedSmsChannel();
    expect(whatsapp.channel).toBe(ContactChannel.WHATSAPP);
    expect(sms.channel).toBe(ContactChannel.SMS);
    expect((await whatsapp.send(message)).providerMessageId).toMatch(/^sim-whatsapp-/);
    expect((await sms.send(message)).providerMessageId).toMatch(/^sim-sms-/);
  });
});
