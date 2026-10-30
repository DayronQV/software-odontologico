import { INestApplication } from '@nestjs/common';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, http } from './helpers';

interface Operation {
  operationId: string;
  summary?: string;
  description?: string;
  security?: unknown[];
  responses: Record<string, unknown>;
  'x-roles'?: string[];
}

/**
 * Contrato OpenAPI 3.0 (SRS §8.2): todo endpoint documentado con resumen, roles, errores y esquema.
 * Con WRITE_OPENAPI=1 exporta backend/openapi.json (se valida con Spectral en CI).
 */
describe('Documentación OpenAPI 3.0', () => {
  let app: INestApplication;
  let document: { openapi: string; info: { version: string }; paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> } };
  let operations: Array<{ method: string; path: string; op: Operation }>;

  beforeAll(async () => {
    app = await createTestApp();
    document = (await http(app).get('/api/docs-json').expect(200)).body;
    operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]) => ({ method, path, op })),
    );
    if (process.env.WRITE_OPENAPI === '1') {
      writeFileSync(join(__dirname, '..', 'openapi.json'), JSON.stringify(document, null, 2));
    }
  });
  afterAll(() => app.close());

  it('es OpenAPI 3.0 con esquema de seguridad Bearer JWT y versión 1.0.0', () => {
    expect(document.openapi).toMatch(/^3\.0\./);
    expect(document.info.version).toBe('1.0.0');
    expect(document.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(operations.length).toBeGreaterThan(150);
  });

  it('cada operación tiene identificador único, resumen y descripción de acceso', () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { method, path, op } of operations) {
      expect(op.summary?.length).toBeGreaterThan(5);
      expect(op.description).toMatch(/Roles autorizados|Cualquier usuario autenticado|Acceso público/);
      expect(Object.keys(op.responses).length).toBeGreaterThan(1);
      if (!op.description) throw new Error(`${method} ${path}`);
    }
  });

  it('las operaciones protegidas documentan 401 y 403 con el esquema de error', () => {
    for (const { op } of operations.filter((o) => o.op.security?.length)) {
      expect(op.responses['401']).toBeDefined();
      expect(op.responses['403']).toBeDefined();
    }
    expect(document.components.schemas.ErrorResponse).toBeDefined();
  });

  it('los roles autorizados quedan visibles, también cuando se declaran a nivel de controlador', () => {
    const chairs = operations.find((o) => o.path.startsWith('/api/catalog/chairs'))!;
    expect(chairs.op['x-roles']).toEqual(['ADMIN_TI']);
    expect(chairs.op.description).toContain('Administrador TI');
    const audit = operations.find((o) => o.path === '/api/audit' && o.method === 'get')!;
    expect(audit.op['x-roles']).toEqual(expect.arrayContaining(['ADMIN_TI', 'AUDITOR']));
  });

  it('solo los endpoints públicos (login, refresh, health…) no exigen autenticación', () => {
    const open = operations.filter((o) => !o.op.security?.length).map((o) => `${o.method} ${o.path}`);
    expect(open.length).toBeLessThanOrEqual(6);
    expect(open).toEqual(expect.arrayContaining(['get /api/health']));
  });
});
