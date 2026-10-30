import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ContactChannel } from '@prisma/client';
import { SettingsService } from '../catalog/settings/settings.service';
import { MESSAGING_CHANNELS, type MessagingChannel } from '../integrations/messaging/messaging-channel';
import { PrismaService } from '../prisma/prisma.service';
import { calculateAge, ADULT_AGE } from '../patients/domain/age';
import { OTP_TTL_MINUTES, maskContact } from './domain/otp';

export interface OtpDestination {
  channel: ContactChannel;
  to: string;
  /** PACIENTE, o TUTOR si el paciente es menor de edad. */
  signerRelation: 'PACIENTE' | 'TUTOR';
  /** Nombre sugerido para quien firma. */
  signerName: string;
}

/** Elige a quién y por qué canal se envía el código (RF-06), y lo envía por el puerto de mensajería. */
@Injectable()
export class OtpDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(MESSAGING_CHANNELS) private readonly channels: MessagingChannel[],
  ) {}

  /** Los menores de edad firman a través de su tutor legal. */
  async signerRelation(patientId: string): Promise<'PACIENTE' | 'TUTOR'> {
    const patient = await this.prisma.db.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: { birthDate: true },
    });
    return calculateAge(patient.birthDate, new Date()) < ADULT_AGE ? 'TUTOR' : 'PACIENTE';
  }

  /** Los menores no firman: el código va al tutor legal. */
  async resolveDestination(patientId: string): Promise<OtpDestination> {
    const patient = await this.prisma.db.patient.findUniqueOrThrow({
      where: { id: patientId },
      include: { guardian: true },
    });
    const minor = calculateAge(patient.birthDate, new Date()) < ADULT_AGE;
    const contact = minor && patient.guardian
      ? { phone: patient.guardian.phone, email: patient.guardian.email }
      : { phone: patient.phone, email: patient.email };
    const signerName = minor && patient.guardian
      ? patient.guardian.fullName
      : `${patient.firstName} ${patient.lastName}`;

    // Se respeta el canal preferido; si no hay dato de contacto, se usa el que exista.
    const order: ContactChannel[] = [
      patient.preferredChannel,
      ContactChannel.EMAIL,
      ContactChannel.WHATSAPP,
      ContactChannel.SMS,
    ];
    for (const channel of order) {
      const to = channel === ContactChannel.EMAIL ? contact.email : contact.phone;
      if (to && this.channels.some((c) => c.channel === channel)) {
        return { channel, to, signerRelation: minor ? 'TUTOR' : 'PACIENTE', signerName };
      }
    }
    throw new ConflictException(
      'No hay teléfono ni correo para enviar el código: firme en pantalla táctil o complete el contacto',
    );
  }

  async send(destination: OtpDestination, code: string, patientFirstName: string): Promise<string> {
    const { clinicName } = await this.settings.get();
    const channel = this.channels.find((c) => c.channel === destination.channel)!;
    await channel.send({
      to: destination.to,
      subject: `${clinicName}: código de firma`,
      body:
        `Hola ${patientFirstName}, su código para firmar el documento es ${code}. ` +
        `Vence en ${OTP_TTL_MINUTES} minutos. No lo comparta con nadie.`,
    });
    return maskContact(destination.to);
  }
}
