import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config';

export const DOWNLOAD_URL_TTL_SECONDS = 60;

/**
 * Almacenamiento de documentos clínicos (adjuntos, consentimientos firmados, firmas) en MinIO/S3.
 * El bucket cifra en reposo (SSE-S3). Las descargas se hacen con URLs firmadas de vida muy corta.
 */
@Injectable()
export class BlobStorageService {
  private readonly client: S3Client;
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const { env } = config;
    this.bucket = env.S3_BUCKET;
    const credentials = { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY };
    const common = {
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    };
    // El backend habla con MinIO por la red interna; el navegador usa la URL pública.
    this.client = new S3Client({ ...common, endpoint: env.S3_ENDPOINT });
    this.presigner = new S3Client({ ...common, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  }

  /** Comprueba que el bucket responde (telemetría). */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await response.Body!.transformToByteArray());
  }

  /** URL de descarga/visualización que caduca en 60 s. */
  signedUrl(key: string, filename: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.presigner,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }
}
