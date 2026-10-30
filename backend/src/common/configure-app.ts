import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppConfigService } from '../config/app-config';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { enrichOpenApi } from './openapi-enrichment';
import { serializeDecimalsAsNumbers } from './serialization';

/** Configuración común de la app (la usan main.ts y las pruebas e2e). */
export function configureApp(app: INestApplication): void {
  const { env } = app.get(AppConfigService);

  // Detrás de Nginx: para que req.ip sea la IP real del cliente (auditoría, rate limit).
  app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY);

  serializeDecimalsAsNumbers();
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Helmet con CSP estricta; Swagger UI necesita scripts inline, así que solo ahí se relaja.
  const strict = helmet();
  const docs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/api/docs') ? docs : strict)(req, res, next),
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerEnabled = env.SWAGGER_ENABLED
    ? env.SWAGGER_ENABLED === 'true'
    : env.NODE_ENV !== 'production';
  if (!swaggerEnabled) return;

  const document = enrichOpenApi(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SIGO-Dental API')
        .setDescription(
          'Sistema Integral de Gestión Odontológica y Expediente Clínico Digital. ' +
            'Autenticación: JWT de acceso (10 min) + MFA TOTP obligatorio; sesión inactiva máx. 15 min.',
        )
        .setVersion('1.0.0')
        .setContact('SIGO-Dental', '', 'soporte@sigo-dental.test')
        .addServer('/', 'Servidor actual')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .build(),
      {
        operationIdFactory: (controller: string, method: string) =>
          `${controller.replace(/Controller$/, '')}_${method}`,
      },
    ),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
