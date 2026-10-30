import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import Redis from 'ioredis';
import { TEST_ENV } from './test-env';

/** Deja la base de pruebas limpia: esquema nuevo + migraciones (incluye triggers) + usuarios semilla. */
export default async function globalSetup(): Promise<void> {
  const url = TEST_ENV.DATABASE_URL;
  if (!url.includes('/sigo_test')) {
    throw new Error('Por seguridad, las pruebas solo pueden reiniciar la base sigo_test');
  }
  const env = { ...process.env, ...TEST_ENV };

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('npx ts-node src/seed.ts', { env, stdio: 'inherit' });

  const redis = new Redis(TEST_ENV.REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}
