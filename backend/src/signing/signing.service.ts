import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SigningMethod, SigningPurpose, SigningRequest, SigningStatus } from '@prisma/client';
import { canonicalJson, sha256 } from '../clinical/domain/signature';
import { CryptoService } from '../crypto/crypto.service';
import { BlobStorageService } from '../files/blob-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/transaction';
import { OTP_MAX_ATTEMPTS, generateOtp, otpExpiry, safeEqualHex } from './domain/otp';
import { decodeSignatureImage } from './domain/signature-image';
import type { SignTouchDto } from './dto/signing.dto';
import { OtpDeliveryService } from './otp-delivery.service';
import type { HandlerRegistry, SigningEvidence, SigningHandler } from './signing.types';

/** Datos de la petición que firma, para dejar constancia. */
export interface SignerContext {
  ip: string | null;
}

export function signingView(request: SigningRequest) {
  const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - request.otpAttempts);
  return {
    id: request.id,
    purpose: request.purpose,
    status: request.status,
    method: request.method,
    signerName: request.signerName,
    signerRelation: request.signerRelation,
    signedAt: request.signedAt,
    evidenceHash: request.evidenceHash,
    otp: request.otpSentTo
      ? { sentTo: request.otpSentTo, expiresAt: request.otpExpiresAt, attemptsLeft }
      : null,
  };
}

/**
 * Firma del paciente o su tutor (RF-06), reutilizada por consentimientos y aprobación de presupuestos:
 *  - en pantalla táctil: trazo + metadatos del dispositivo;
 *  - por OTP: código de un solo uso con vencimiento e intentos limitados.
 */
@Injectable()
export class SigningService {
  private readonly handlers: HandlerRegistry = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly blobs: BlobStorageService,
    private readonly delivery: OtpDeliveryService,
  ) {}

  registerHandler(purpose: SigningPurpose, handler: SigningHandler): void {
    this.handlers.set(purpose, handler);
  }

  /** Dentro de una transacción ajena (la crea el consentimiento o la aprobación). */
  create(
    tx: Tx,
    patientId: string,
    purpose: SigningPurpose,
    createdById: string,
  ) {
    return tx.signingRequest.create({ data: { patientId, purpose, createdById } });
  }

  async get(id: string) {
    return signingView(await this.find(id));
  }

  /** Genera y envía un código nuevo (invalida el anterior y reinicia los intentos). */
  async sendOtp(id: string) {
    const request = await this.findPending(id);
    const destination = await this.delivery.resolveDestination(request.patientId);
    const patient = await this.prisma.db.patient.findUniqueOrThrow({
      where: { id: request.patientId },
      select: { firstName: true },
    });

    const code = generateOtp();
    const sentTo = await this.delivery.send(destination, code, patient.firstName);
    const updated = await this.prisma.db.signingRequest.update({
      where: { id },
      data: {
        otpHash: this.hashCode(id, code),
        otpExpiresAt: otpExpiry(new Date()),
        otpAttempts: 0,
        otpSentTo: sentTo,
        signerName: request.signerName ?? destination.signerName,
        signerRelation: destination.signerRelation,
      },
    });
    return { ...signingView(updated), suggestedSignerName: destination.signerName };
  }

  async verifyOtp(id: string, code: string, signerName: string, context: SignerContext) {
    const request = await this.findPending(id);
    if (!request.otpHash || !request.otpExpiresAt) {
      throw new ConflictException('Primero solicite el envío del código');
    }
    if (request.otpExpiresAt.getTime() < Date.now()) {
      throw new ConflictException('El código venció: solicite uno nuevo');
    }
    if (request.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new ConflictException('Se agotaron los intentos: solicite un código nuevo');
    }
    // Cuenta el intento ANTES de comparar: ninguna petición concurrente puede saltarse el límite.
    const attempt = await this.prisma.db.signingRequest.updateMany({
      where: { id, status: SigningStatus.PENDING, otpAttempts: request.otpAttempts },
      data: { otpAttempts: { increment: 1 } },
    });
    if (attempt.count === 0) throw new ConflictException('Reintente: la solicitud cambió');

    if (!safeEqualHex(request.otpHash, this.hashCode(id, code))) {
      const left = OTP_MAX_ATTEMPTS - request.otpAttempts - 1;
      throw new BadRequestException(
        left > 0 ? `Código incorrecto. Intentos restantes: ${left}` : 'Código incorrecto. Sin intentos restantes',
      );
    }
    return this.complete(request, {
      method: SigningMethod.OTP,
      signerName,
      signedAt: new Date(),
      ip: context.ip,
      otpSentTo: request.otpSentTo ?? undefined,
    });
  }

  async signTouch(id: string, dto: SignTouchDto, context: SignerContext) {
    const request = await this.findPending(id);
    const image = decodeSignatureImage(dto.image);
    if (!image) throw new BadRequestException('La firma no es una imagen PNG válida');

    const signedAt = new Date();
    const key = `signatures/${request.patientId}/${request.id}.png`;
    await this.blobs.put(key, image, 'image/png');
    return this.complete(
      request,
      {
        method: SigningMethod.TOUCH,
        signerName: dto.signerName,
        signedAt,
        ip: context.ip,
        signatureImage: image,
        signatureImageKey: key,
      },
      { strokes: dto.strokes, durationMs: dto.durationMs, pointerType: dto.pointerType, maxPressure: dto.maxPressure },
    );
  }

  // ------------------------------------------------------------------ interno

  private async complete(
    request: SigningRequest,
    partial: Omit<SigningEvidence, 'evidenceHash' | 'signerRelation'>,
    meta?: Record<string, unknown>,
  ) {
    const signerRelation = await this.delivery.signerRelation(request.patientId);
    const evidence: SigningEvidence = {
      ...partial,
      signerRelation,
      evidenceHash: sha256(
        canonicalJson({
          signingId: request.id,
          purpose: request.purpose,
          patientId: request.patientId,
          method: partial.method,
          signerName: partial.signerName,
          signedAt: partial.signedAt.toISOString(),
          image: partial.signatureImage ? sha256(partial.signatureImage) : null,
          otpSentTo: partial.otpSentTo ?? null,
        }),
      ),
    };

    const handler = this.handlers.get(request.purpose);
    const document = handler ? await handler.prepare(request, evidence) : undefined;

    await this.prisma.db.$transaction(async (tx) => {
      const marked = await tx.signingRequest.updateMany({
        where: { id: request.id, status: SigningStatus.PENDING },
        data: {
          status: SigningStatus.SIGNED,
          method: evidence.method,
          signerName: evidence.signerName,
          signerRelation: evidence.signerRelation,
          signedAt: evidence.signedAt,
          signedIp: evidence.ip,
          signatureImageKey: evidence.signatureImageKey ?? null,
          signatureMeta: (meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          evidenceHash: evidence.evidenceHash,
          otpHash: null,
        },
      });
      if (marked.count === 0) throw new ConflictException('Este documento ya fue firmado');
      if (handler && document) await handler.commit(request, evidence, document, tx);
    });
    return signingView(await this.find(request.id));
  }

  private async find(id: string): Promise<SigningRequest> {
    const request = await this.prisma.db.signingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud de firma no encontrada');
    return request;
  }

  private async findPending(id: string): Promise<SigningRequest> {
    const request = await this.find(id);
    if (request.status === SigningStatus.SIGNED) {
      throw new ConflictException('Este documento ya fue firmado');
    }
    return request;
  }

  private hashCode(signingId: string, code: string): string {
    return this.crypto.blindIndex(`${signingId}:${code}`);
  }
}
