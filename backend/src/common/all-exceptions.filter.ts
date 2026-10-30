import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** Respuesta de error uniforme. Nunca expone trazas ni detalles internos al cliente. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Error interno del servidor';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const obj = body as { message?: string | string[]; error?: string; details?: unknown };
        message = obj.message ?? exception.message;
        error = obj.error ?? exception.name;
        details = obj.details; // datos estructurados opcionales (p. ej. alertas de alergia)
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        error = 'Conflict';
        message = 'Ya existe un registro con esos datos';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        error = 'Not Found';
        message = 'Registro no encontrado';
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      }
    } else {
      const err = exception as Error;
      this.logger.error(err?.message ?? 'Error desconocido', err?.stack);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      ...(details !== undefined && { details }),
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
