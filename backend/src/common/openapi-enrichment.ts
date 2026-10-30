import type { OpenAPIObject } from '@nestjs/swagger';

type Operation = {
  summary?: string;
  tags?: string[];
  description?: string;
  operationId?: string;
  parameters?: Array<{ in: string }>;
  requestBody?: unknown;
  responses?: Record<string, { description?: string; content?: unknown }>;
  security?: unknown[];
  'x-roles'?: string[];
};

const VERB: Record<string, string> = {
  get: 'Consultar',
  post: 'Crear / ejecutar',
  put: 'Reemplazar',
  patch: 'Actualizar',
  delete: 'Eliminar',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN_TI: 'Administrador TI',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
  ASISTENTE: 'Asistente',
  AUDITOR: 'Auditor',
};

const SUCCESS: Record<string, string> = { '200': 'Operación exitosa', '201': 'Recurso creado', '204': 'Sin contenido' };

const ERRORS: Record<string, { description: string; when: (op: Operation, secured: boolean) => boolean }> = {
  '400': { description: 'Solicitud inválida: validación de datos o regla de negocio', when: (op) => !!op.requestBody || !!op.parameters?.length },
  '401': { description: 'No autenticado o token vencido / sesión inactiva', when: (_, secured) => secured },
  '403': { description: 'Rol sin permiso para esta operación (menor privilegio)', when: (_, secured) => secured },
  '429': { description: 'Demasiadas solicitudes (límite de frecuencia)', when: () => true },
  '500': { description: 'Error interno (sin detalles técnicos en la respuesta)', when: () => true },
};

/** Nombre legible del recurso a partir de la ruta: «/api/patients/{id}/notes» → «patients / notes». */
export function resourceOf(path: string): string {
  return path
    .split('/')
    .filter((part) => part && part !== 'api' && !part.startsWith('{'))
    .join(' / ');
}

export function summaryFor(method: string, path: string): string {
  const verb = method === 'get' && path.endsWith('}') ? 'Obtener' : VERB[method] ?? method.toUpperCase();
  return `${verb} ${resourceOf(path)}`.trim();
}

/**
 * Completa el documento OpenAPI: resumen de cada operación, roles autorizados, respuestas de error
 * estándar con su esquema (`ErrorResponse`) y ejemplo. Respeta lo que ya definió cada controlador.
 */
export function enrichOpenApi(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ErrorResponse = {
    type: 'object',
    required: ['statusCode', 'message'],
    properties: {
      statusCode: { type: 'integer', example: 403 },
      message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], example: 'No tiene permiso para esta operación' },
      error: { type: 'string', example: 'Forbidden' },
      details: { type: 'object', additionalProperties: true, description: 'Información adicional de la regla de negocio, cuando aplica' },
    },
    example: { statusCode: 403, message: 'No tiene permiso para esta operación', error: 'Forbidden' },
  };

  const tags = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, raw] of Object.entries(item as Record<string, Operation>)) {
      if (!VERB[method]) continue;
      const op = raw;
      const secured = !!op.security?.length;
      op.summary ??= summaryFor(method, path);
      for (const tag of op.tags ?? []) tags.add(tag);

      const roles = op['x-roles'];
      const access = !secured
        ? 'Acceso público (sin autenticación).'
        : roles?.length
          ? `Roles autorizados: ${roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}.`
          : 'Cualquier usuario autenticado (con MFA verificado).';
      op.description = op.description ? `${op.description}\n\n${access}` : access;

      op.responses ??= {};
      for (const [status, description] of Object.entries(SUCCESS)) {
        if (op.responses[status] && !op.responses[status].description) op.responses[status].description = description;
      }
      for (const [status, error] of Object.entries(ERRORS)) {
        if (op.responses[status] || !error.when(op, secured)) continue;
        op.responses[status] = {
          description: error.description,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
      }
    }
  }
  document.tags = [...tags].sort().map((name) => ({ name, description: `Operaciones de «${name}»` }));
  return document;
}
