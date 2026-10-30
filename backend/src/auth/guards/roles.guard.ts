import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ANY_ROLE_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import type { AuthenticatedRequest } from '../../common/types';

/**
 * RBAC con menor privilegio (RNF-05): DENIEGA POR DEFECTO.
 * Todo endpoint debe declarar @Public(), @AnyRole() o @Roles(...), si no, responde 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ANY_ROLE_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) {
      throw new ForbiddenException('Acceso denegado: el endpoint no declara roles autorizados');
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    return true;
  }
}
