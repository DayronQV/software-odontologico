import { Injectable } from '@nestjs/common';
import { ContactChannel } from '@prisma/client';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/app-config';
import type { MessagingChannel, OutboundMessage, SendResult } from './messaging-channel';

/** Correo transaccional real por SMTP (en desarrollo, Mailpit: http://localhost:8025; en producción, el SMTP configurado). */
@Injectable()
export class EmailChannel implements MessagingChannel {
  readonly channel = ContactChannel.EMAIL;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM, NODE_ENV } =
      config.env;
    this.from = MAIL_FROM;
    const production = NODE_ENV === 'production';
    this.transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      // En desarrollo (Mailpit) no hay TLS; en producción se exige STARTTLS o TLS implícito.
      ignoreTLS: !production,
      requireTLS: production && !SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS ?? '' } : undefined,
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
