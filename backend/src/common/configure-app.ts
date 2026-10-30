import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppConfigService } from '../config/app-config';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Configuración común de la app (la usan main.ts y las pruebas e2e). */
export function configureApp(app: INestApplication): void {
  const { env } = app.get(AppConfigService);

  // Detrás de Nginx: para que req.ip sea la IP real del cliente (auditoría, rate limit).
  app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY);

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

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SIGO-Dental API')
      .setDescription('Sistema Integral de Gestión Odontológica y Expediente Clínico Digital')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
