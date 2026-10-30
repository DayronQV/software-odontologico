import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';
import { AppConfigService } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const { PORT } = app.get(AppConfigService).env;
  await app.listen(PORT, '0.0.0.0');
  Logger.log(`API lista en el puerto ${PORT} — Swagger en /api/docs`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.message : error, undefined, 'Bootstrap');
  process.exit(1);
});
