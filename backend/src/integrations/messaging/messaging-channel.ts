import type { ContactChannel } from '@prisma/client';

/**
 * Puerto de mensajería (RF-11): WhatsApp Business (Meta Cloud API), SMS (Twilio) y correo.
 * WhatsApp y SMS usan adaptadores simulados (requieren cuentas de pago); el correo es real
 * contra Mailpit/SMTP.
 */
export interface OutboundMessage {
  /** Teléfono (WhatsApp/SMS) o correo, según el canal. */
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface MessagingChannel {
  readonly channel: ContactChannel;
  send(message: OutboundMessage): Promise<SendResult>;
}

export const MESSAGING_CHANNELS = Symbol('MESSAGING_CHANNELS');
