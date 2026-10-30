import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { AppConfigService } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

const PERIOD = 30;
const RECOVERY_CODE_COUNT = 8;

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/** MFA con TOTP (RFC 6238): compatible con Google Authenticator, Microsoft Authenticator, Authy. */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private totp(secretBase32: string, label: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: this.config.env.MFA_ISSUER,
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
  }

  /** Devuelve el paso de 30 s en el que el código es válido (tolerancia ±1), o null. */
  private validate(secretBase32: string, label: string, code: string): number | null {
    const delta = this.totp(secretBase32, label).validate({ token: code, window: 1 });
    return delta === null ? null : Math.floor(Date.now() / 1000 / PERIOD) + delta;
  }

  async isEnrolled(userId: string): Promise<boolean> {
    const record = await this.prisma.db.mfaSecret.findUnique({ where: { userId } });
    return !!record?.confirmed;
  }

  /** Genera un secreto nuevo (aún sin confirmar) y su QR. */
  async setup(user: { id: string; email: string }) {
    const existing = await this.prisma.db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (existing?.confirmed) {
      throw new ConflictException('El MFA ya está configurado para este usuario');
    }
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    await this.prisma.db.mfaSecret.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secret, confirmed: false, recoveryCodes: [] },
      update: { secret, confirmed: false, lastUsedStep: null, recoveryCodes: [], confirmedAt: null },
    });
    const otpauthUrl = this.totp(secret, user.email).toString();
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  /** Confirma el enrolamiento con un primer código y emite los códigos de recuperación. */
  async enable(user: { id: string; email: string }, code: string): Promise<string[]> {
    const record = await this.prisma.db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (!record) throw new BadRequestException('Primero inicie la configuración de MFA');
    if (record.confirmed) throw new ConflictException('El MFA ya está configurado');

    const step = this.validate(record.secret, user.email, code);
    if (step === null) throw new UnauthorizedException('Código MFA inválido');

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const hex = randomBytes(10).toString('hex').toUpperCase();
      return `${hex.slice(0, 10)}-${hex.slice(10)}`;
    });
    await this.prisma.db.mfaSecret.update({
      where: { userId: user.id },
      data: {
        confirmed: true,
        confirmedAt: new Date(),
        lastUsedStep: step,
        recoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    });
    return recoveryCodes;
  }

  /** Verifica un código TOTP (una sola vez por paso) o un código de recuperación. */
  async verify(
    user: { id: string; email: string },
    input: { code?: string; recoveryCode?: string },
  ): Promise<'totp' | 'recovery'> {
    const record = await this.prisma.db.mfaSecret.findUnique({ where: { userId: user.id } });
    if (!record?.confirmed) throw new BadRequestException('El MFA no está configurado');

    if (input.code) {
      const step = this.validate(record.secret, user.email, input.code);
      if (step === null || (record.lastUsedStep !== null && step <= record.lastUsedStep)) {
        throw new UnauthorizedException('Código MFA inválido');
      }
      await this.prisma.db.mfaSecret.update({
        where: { userId: user.id },
        data: { lastUsedStep: step },
      });
      return 'totp';
    }

    if (input.recoveryCode) {
      const hashed = hashRecoveryCode(input.recoveryCode);
      if (!record.recoveryCodes.includes(hashed)) {
        throw new UnauthorizedException('Código de recuperación inválido');
      }
      await this.prisma.db.mfaSecret.update({
        where: { userId: user.id },
        data: { recoveryCodes: record.recoveryCodes.filter((h) => h !== hashed) },
      });
      return 'recovery';
    }

    throw new BadRequestException('Envíe un código o un código de recuperación');
  }
}
