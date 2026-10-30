import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ANY_ROLE_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { RolesGuard } from './roles.guard';

function context(metadata: Record<string, unknown>, role?: Role, type = 'http') {
  const handler = () => undefined;
  class Controller {}
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (deniega por defecto)', () => {
  const guard = new RolesGuard(new Reflector());

  it('permite endpoints @Public', () => {
    expect(guard.canActivate(context({ [IS_PUBLIC_KEY]: true }))).toBe(true);
  });

  it('permite @AnyRole a cualquier usuario autenticado', () => {
    expect(guard.canActivate(context({ [ANY_ROLE_KEY]: true }, Role.ASISTENTE))).toBe(true);
  });

  it('DENIEGA un endpoint sin roles declarados', () => {
    expect(() => guard.canActivate(context({}, Role.ADMIN_TI))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ [ROLES_KEY]: [] }, Role.ADMIN_TI))).toThrow(
      ForbiddenException,
    );
  });

  it('permite solo los roles declarados', () => {
    const meta = { [ROLES_KEY]: [Role.AUDITOR, Role.ADMIN_TI] };
    expect(guard.canActivate(context(meta, Role.AUDITOR))).toBe(true);
    expect(() => guard.canActivate(context(meta, Role.RECEPCIONISTA))).toThrow(ForbiddenException);
  });

  it('deniega si no hay usuario en la petición', () => {
    expect(() => guard.canActivate(context({ [ROLES_KEY]: [Role.ADMIN_TI] }))).toThrow(
      ForbiddenException,
    );
  });

  it('no interviene fuera de HTTP (p. ej. WebSockets)', () => {
    expect(guard.canActivate(context({}, undefined, 'ws'))).toBe(true);
  });
});
