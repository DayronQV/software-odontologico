import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser, RequestMetaData } from '../common/types';
import { AppConfigService } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface UserLike {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export const toUserView = (u: UserLike) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- login

  async login(dto: LoginDto, meta: RequestMetaData) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.db.user.findUnique({ where: { email } });

    let passwordOk = false;
    if (user) passwordOk = await this.passwords.verify(user.passwordHash, dto.password);
    else await this.passwords.verifyDummy(dto.password);

    if (!user || !passwordOk || !user.active) {
      await this.audit.record({
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        entityId: user?.id ?? null,
        userId: user?.id ?? null,
        role: user?.role ?? null,
        after: { email },
        ...meta,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const enrolled = await this.mfa.isEnrolled(user.id);
    const sessionId = randomUUID();
    await this.sessions.create(sessionId, user.id);
    const pair = await this.issueTokens(user, sessionId, false, meta);

    await this.audit.record({
      action: 'LOGIN',
      entity: 'Auth',
      entityId: user.id,
      userId: user.id,
      role: user.role,
      after: { mfaEnrolled: enrolled },
      ...meta,
    });

    return { ...pair, user: toUserView(user), mfa: { enrolled, verified: false } };
  }

  // ------------------------------------------------------------------ MFA

  setupMfa(user: AuthUser) {
    return this.mfa.setup(user);
  }

  async enableMfa(user: AuthUser, code: string, meta: RequestMetaData) {
    let recoveryCodes: string[];
    try {
      recoveryCodes = await this.mfa.enable(user, code);
    } catch (error) {
      await this.auditMfa('MFA_FAILED', user, meta, { step: 'enable' });
      throw error;
    }
    const pair = await this.upgradeSession(user, meta);
    await this.auditMfa('MFA_ENABLED', user, meta);
    return { ...pair, recoveryCodes };
  }

  async verifyMfa(user: AuthUser, input: { code?: string; recoveryCode?: string }, meta: RequestMetaData) {
    let method: 'totp' | 'recovery';
    try {
      method = await this.mfa.verify(user, input);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.auditMfa('MFA_FAILED', user, meta, { step: 'verify' });
      }
      throw error;
    }
    const pair = await this.upgradeSession(user, meta);
    await this.auditMfa(method === 'recovery' ? 'MFA_RECOVERY_USED' : 'MFA_VERIFIED', user, meta);
    return pair;
  }

  private auditMfa(
    action: string,
    user: AuthUser,
    meta: RequestMetaData,
    after?: Record<string, string>,
  ) {
    return this.audit.record({
      action,
      entity: 'Auth',
      entityId: user.id,
      userId: user.id,
      role: user.role,
      after,
      ...meta,
    });
  }

  /** Tras validar el MFA: revoca los refresh tokens parciales y emite tokens con mfa=true. */
  private async upgradeSession(user: AuthUser, meta: RequestMetaData): Promise<TokenPair> {
    await this.prisma.db.refreshToken.updateMany({
      where: { sessionId: user.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user, user.sessionId, true, meta);
  }

  // -------------------------------------------------------------- refresh

  async refresh(rawToken: string, meta: RequestMetaData): Promise<TokenPair> {
    const row = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!row) throw new UnauthorizedException('Refresh token inválido');

    if (row.revokedAt) {
      // Un token ya rotado se volvió a usar: posible robo. Se cierra toda la sesión.
      await this.revokeSession(row.sessionId);
      await this.audit.record({
        action: 'TOKEN_REUSE_DETECTED',
        entity: 'Auth',
        entityId: row.userId,
        userId: row.userId,
        ...meta,
      });
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (row.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token expirado');
    if (!(await this.sessions.touch(row.sessionId))) {
      throw new UnauthorizedException('Sesión expirada por inactividad');
    }

    const user = await this.prisma.db.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.active) throw new UnauthorizedException('Usuario inactivo');

    const next = await this.issueTokens(user, row.sessionId, row.mfaVerified, meta);
    const newRow = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: sha256(next.refreshToken) },
      select: { id: true },
    });
    await this.prisma.db.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: newRow?.id },
    });
    return next;
  }

  // --------------------------------------------------------------- logout

  async logout(user: AuthUser, meta: RequestMetaData): Promise<void> {
    await this.revokeSession(user.sessionId);
    await this.audit.record({
      action: 'LOGOUT',
      entity: 'Auth',
      entityId: user.id,
      userId: user.id,
      role: user.role,
      ...meta,
    });
  }

  // ------------------------------------------------------ cambio de clave

  async changePassword(user: AuthUser, dto: ChangePasswordDto, meta: RequestMetaData): Promise<void> {
    const record = await this.prisma.db.user.findUnique({ where: { id: user.id } });
    if (!record || !(await this.passwords.verify(record.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
    await this.revokeAllSessions(user.id, user.sessionId);
    await this.audit.record({
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      role: user.role,
      ...meta,
    });
  }

  // ------------------------------------------------------- sesiones/tokens

  /** Revoca tokens y sesiones de un usuario (opcionalmente conservando una sesión). */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    const rows = await this.prisma.db.refreshToken.findMany({
      where: { userId, revokedAt: null, ...(exceptSessionId && { sessionId: { not: exceptSessionId } }) },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    for (const { sessionId } of rows) await this.revokeSession(sessionId);
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.sessions.destroy(sessionId);
  }

  private async issueTokens(
    user: UserLike,
    sessionId: string,
    mfaVerified: boolean,
    meta: RequestMetaData,
  ): Promise<TokenPair> {
    const raw = randomBytes(48).toString('base64url');
    await this.prisma.db.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        tokenHash: sha256(raw),
        mfaVerified,
        expiresAt: new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_SECONDS * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    const accessToken = await this.tokens.signAccess({
      sub: user.id,
      role: user.role,
      sid: sessionId,
      mfa: mfaVerified,
    });
    return { accessToken, refreshToken: raw, expiresIn: this.tokens.accessTtlSeconds };
  }
}
