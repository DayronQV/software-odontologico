import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PARTIAL_AUTH_KEY, IS_PUBLIC_KEY } from '../../common/decorators';
import type { AuthenticatedRequest } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../session.service';
import { TokenService } from '../token.service';

/**
 * Guard global de autenticación (RNF-05):
 *  1. Valida el JWT.
 *  2. Verifica y renueva la sesión en Redis (cierre a los 15 min de inactividad).
 *  3. Carga al usuario desde la BD (rol e is-active siempre vigentes).
 *  4. Exige MFA verificado, salvo en los endpoints marcados @AllowPartialAuth.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');

    let payload;
    try {
      payload = await this.tokens.verifyAccess(header.slice(7));
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (!(await this.sessions.touch(payload.sid))) {
      throw new UnauthorizedException('Sesión expirada por inactividad');
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, active: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuario inactivo o inexistente');

    const allowPartial = this.reflector.getAllAndOverride<boolean>(ALLOW_PARTIAL_AUTH_KEY, targets);
    if (!payload.mfa && !allowPartial) {
      throw new ForbiddenException('Debe verificar el segundo factor (MFA) para continuar');
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      sessionId: payload.sid,
      mfaVerified: payload.mfa,
    };
    return true;
  }
}
