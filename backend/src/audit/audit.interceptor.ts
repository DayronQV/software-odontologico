/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AUDIT_ACTION_KEY, AUDIT_ENTITY_KEY } from '../common/decorators';
import type { AuthenticatedRequest } from '../common/types';
import { AuditService } from './audit.service';

const METHOD_ACTIONS: Record<string, string> = {
  GET: 'READ',
  HEAD: 'READ',
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

const SENSITIVE_KEY = /pass|secret|token|code|pin|hash/i;

/** Copia del body sin valores sensibles (contraseñas, códigos, tokens). */
export function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : value;
  }
  return out;
}

/**
 * RNF-06: registra automáticamente cada lectura/escritura sobre las entidades marcadas
 * con @AuditEntity (p. ej. las clínicas). Si el registro de auditoría falla, la petición falla.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const targets = [context.getHandler(), context.getClass()];
    const entity = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ENTITY_KEY, targets);
    if (!entity) return next.handle();

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const action =
      this.reflector.getAllAndOverride<string | undefined>(AUDIT_ACTION_KEY, targets) ??
      METHOD_ACTIONS[req.method] ??
      req.method;

    return next.handle().pipe(
      mergeMap(async (result: any) => {
        const ua = req.headers['user-agent'];
        // En lecturas se guarda la consulta (qué se pidió); en escrituras, el cuerpo sin secretos.
        const body = sanitizeBody(req.method === 'GET' ? req.query : req.body);
        await this.audit.record({
          action,
          entity,
          entityId: (req.params?.id as string | undefined) ?? result?.id ?? null,
          userId: req.user?.id ?? null,
          role: req.user?.role ?? null,
          ip: req.ip ?? null,
          userAgent: typeof ua === 'string' ? ua.slice(0, 255) : null,
          after: (body as any) ?? undefined,
        });
        return result;
      }),
    );
  }
}
