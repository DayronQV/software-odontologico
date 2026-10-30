import { ArgumentsHost, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ originalUrl: '/api/x' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('respeta las excepciones HTTP', () => {
    const { status, body } = run(new ForbiddenException('No permitido'));
    expect(status).toBe(403);
    expect(body).toMatchObject({ statusCode: 403, message: 'No permitido', path: '/api/x' });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('conserva los mensajes de validación', () => {
    const { body } = run(new BadRequestException(['email inválido', 'rol inválido']));
    expect(body.message).toEqual(['email inválido', 'rol inválido']);
  });

  it('traduce errores de Prisma (único duplicado → 409, no encontrado → 404)', () => {
    const dup = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '6' });
    const missing = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' });
    expect(run(dup).status).toBe(409);
    expect(run(missing).status).toBe(404);
  });

  it('errores inesperados devuelven 500 sin filtrar detalles internos', () => {
    const { status, body } = run(new Error('password=secreto en la consulta SQL'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secreto');
    expect(body.message).toBe('Error interno del servidor');
  });

  it('otros códigos de Prisma también devuelven 500 genérico', () => {
    const other = new Prisma.PrismaClientKnownRequestError('boom', { code: 'P9999', clientVersion: '6' });
    expect(run(other).status).toBe(500);
  });
});
