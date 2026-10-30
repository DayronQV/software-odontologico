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

// Credenciales, texto de búsqueda (`q` puede ser un documento) y datos personales/clínicos:
// el log de auditoría registra QUIÉN accedió a QUÉ registro, no copia información del paciente.
const SENSITIVE_KEY =
  /pass|secret|token|code|pin|hash|document|^q$|allerg|disease|medication|history|name|phone|mail|address|birth|notes|occupation|reference|reason/i;
const MAX_DEPTH = 5;

function redact(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** El id del registro auditado siempre se guarda como texto (algunos modelos usan ids numéricos). */
export function toEntityId(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : String(value);
}

/** Copia del body/consulta sin valores sensibles, incluso dentro de objetos y listas anidadas. */
export function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return redact(body, 0) as Record<string, unknown>;
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
          entityId: toEntityId(req.params?.id ?? req.params?.patientId ?? result?.id),
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
