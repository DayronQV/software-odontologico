import { Injectable, Logger } from '@nestjs/common';
import { ContactChannel } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { MessagingChannel, OutboundMessage, SendResult } from './messaging-channel';

/** El texto enviado queda en el historial de notificaciones (NotificationLog). */
abstract class SimulatedChannel implements MessagingChannel {
  abstract readonly channel: ContactChannel;
  private readonly logger = new Logger('SimulatedMessaging');

  async send(message: OutboundMessage): Promise<SendResult> {
    this.logger.log(`[${this.channel} simulado] → ${message.to}: ${message.subject}`);
    return { providerMessageId: `sim-${this.channel.toLowerCase()}-${randomUUID()}` };
  }
}

/** Sustituye a Meta Cloud API (WhatsApp Business). */
@Injectable()
export class SimulatedWhatsAppChannel extends SimulatedChannel {
  readonly channel = ContactChannel.WHATSAPP;
}

/** Sustituye a Twilio SMS. */
@Injectable()
export class SimulatedSmsChannel extends SimulatedChannel {
  readonly channel = ContactChannel.SMS;
}
