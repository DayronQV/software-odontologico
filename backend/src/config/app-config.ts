import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/** Valores de desarrollo conocidos: se rechazan si NODE_ENV=production. */
export const DEV_JWT_SECRET = '39b9a1107a1223b26b793d2aaaf223fde62bc02920377422e5ed1643c82cb6bb';
export const DEV_ENCRYPTION_KEY = 'nOToCiHZwXXg7ow2HSJS98hdTqC88qPO9iHRP7ZjnbE=';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  REDIS_URL: z.string().min(1, 'REDIS_URL es obligatoria'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  /** AES-256: exactamente 32 bytes codificados en base64. */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY debe ser 32 bytes en base64'),

  // RNF-05: la sesión no puede superar 15 min de inactividad
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  SESSION_IDLE_SECONDS: z.coerce.number().int().min(1).max(900).default(900),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MFA_ISSUER: z.string().default('SIGO-Dental'),

  // Correo transaccional (RF-11). En desarrollo apunta a Mailpit.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** true = TLS implícito (puerto 465); false = STARTTLS si el servidor lo ofrece. */
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MAIL_FROM: z.string().default('SIGO-Dental <no-reply@sigo-dental.test>'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('sigo_minio'),
  S3_SECRET_KEY: z.string().default('sigo_minio_dev_password'),
  S3_BUCKET: z.string().default('sigo-files'),

  /** Documentación Swagger en /api/docs: activa por defecto salvo en producción. */
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración de entorno inválida -> ${detail}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET === DEV_JWT_SECRET || env.ENCRYPTION_KEY === DEV_ENCRYPTION_KEY) {
      throw new Error('En producción no se pueden usar los secretos de desarrollo');
    }
    if (env.S3_SECRET_KEY === 'sigo_minio_dev_password') {
      throw new Error('En producción no se puede usar la clave de almacenamiento de desarrollo');
    }
  }
  return env;
}

@Injectable()
export class AppConfigService {
  readonly env: Env = parseEnv(process.env);
}
