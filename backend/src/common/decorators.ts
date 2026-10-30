import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { Role } from '@prisma/client';
import type { AuthenticatedRequest, RequestMetaData } from './types';

export const IS_PUBLIC_KEY = 'sigo:isPublic';
export const ROLES_KEY = 'sigo:roles';
export const ANY_ROLE_KEY = 'sigo:anyRole';
export const ALLOW_PARTIAL_AUTH_KEY = 'sigo:allowPartialAuth';
export const AUDIT_ENTITY_KEY = 'sigo:auditEntity';
export const AUDIT_ACTION_KEY = 'sigo:auditAction';

/** Endpoint sin autenticación (login, health…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Roles autorizados. Un endpoint sin @Roles/@AnyRole/@Public se DENIEGA (menor privilegio). */
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiExtension('x-roles', roles));

/** Cualquier usuario autenticado, sin importar el rol. */
export const AnyRole = () => SetMetadata(ANY_ROLE_KEY, true);

/** Permite tokens aún sin MFA verificado (solo para enrolar/verificar MFA, logout y /me). */
export const AllowPartialAuth = () => SetMetadata(ALLOW_PARTIAL_AUTH_KEY, true);

/** Marca el controlador/handler como entidad auditada (lecturas y escrituras se registran solas). */
export const AuditEntity = (entity: string) => SetMetadata(AUDIT_ENTITY_KEY, entity);

/** Fuerza el nombre de la acción de auditoría (por defecto se deriva del método HTTP). */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});

export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMetaData => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const ua = req.headers['user-agent'];
    return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 255) : null };
  },
);
