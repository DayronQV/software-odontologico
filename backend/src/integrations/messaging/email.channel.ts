import { Injectable } from '@nestjs/common';
import { ContactChannel } from '@prisma/client';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/app-config';
import type { MessagingChannel, OutboundMessage, SendResult } from './messaging-channel';

/** Correo transaccional real por SMTP (en desarrollo, Mailpit: http://localhost:8025). */
@Injectable()
export class EmailChannel implements MessagingChannel {
  readonly channel = ContactChannel.EMAIL;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    const { SMTP_HOST, SMTP_PORT, MAIL_FROM } = config.env;
    this.from = MAIL_FROM;
    this.transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
    });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return { providerMessageId: info.messageId };
  }
}
