import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/app-config';

export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

const URL_TTL_SECONDS = 300;
const KEY_PREFIX = 'uploads/';

/**
 * Archivos clínicos (Rx, fotos, PDFs) en almacenamiento compatible con S3 (MinIO).
 * El cliente sube/descarga directo con URLs firmadas de corta duración; el bucket cifra en reposo (SSE-S3).
 */
@Injectable()
export class FilesService {
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const { env } = config;
    this.bucket = env.S3_BUCKET;
    // La URL firmada debe apuntar a un host alcanzable por el navegador (puede diferir del interno).
    this.presigner = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  static sanitizeFilename(name: string): string {
    const clean = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    return clean.slice(-100) || 'archivo';
  }

  async createUploadUrl(filename: string, contentType: string) {
    const key = `${KEY_PREFIX}${randomUUID()}/${FilesService.sanitizeFilename(filename)}`;
    const url = await getSignedUrl(
      this.presigner,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: URL_TTL_SECONDS },
    );
    return { key, url, expiresIn: URL_TTL_SECONDS, requiredHeaders: { 'Content-Type': contentType } };
  }

  async createDownloadUrl(key: string) {
    if (!key.startsWith(KEY_PREFIX) || key.includes('..')) {
      throw new BadRequestException('Clave de archivo inválida');
    }
    const url = await getSignedUrl(
      this.presigner,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: URL_TTL_SECONDS },
    );
    return { key, url, expiresIn: URL_TTL_SECONDS };
  }
}
