/**
 * Entorno de pruebas: base de datos y Redis DEDICADOS (nunca los de desarrollo).
 * Requiere la infraestructura de Docker arriba: docker compose up -d postgres redis minio minio-init
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sigo:sigo_dev_password@localhost:5433/sigo_test?schema=public',
  REDIS_URL: 'redis://:sigo_redis_dev@localhost:6379/1',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-0123456789abcdef0123456789abcdef',
  ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM=',
  ACCESS_TOKEN_TTL_SECONDS: '600',
  REFRESH_TOKEN_TTL_SECONDS: '604800',
  SESSION_IDLE_SECONDS: '900',
  CORS_ORIGIN: 'http://localhost:5173',
  TRUST_PROXY: '0',
  THROTTLE_AUTH_LIMIT: '1000',
  THROTTLE_AUTH_TTL_SECONDS: '60',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'sigo_minio',
  S3_SECRET_KEY: 'sigo_minio_dev_password',
  S3_BUCKET: 'sigo-files',
  SEED_PASSWORD: 'Sigo-Test-2026!',
};
