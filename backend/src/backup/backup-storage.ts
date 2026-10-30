import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BackupConfig } from './backup-config';

export interface StoredObject {
  key: string;
  size: number;
  lastModified: Date;
}

/** Acceso S3 a dos buckets: documentos clínicos (origen) y respaldos (destino). */
export class BackupStorage {
  private readonly source: S3Client;
  private readonly target: S3Client;
  private readonly sameProvider: boolean;

  constructor(private readonly config: BackupConfig) {
    const common = {
      region: config.S3_REGION,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    };
    this.source = new S3Client({
      ...common,
      endpoint: config.S3_ENDPOINT,
      credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    });
    this.target = new S3Client({
      ...common,
      endpoint: config.BACKUP_S3_ENDPOINT ?? config.S3_ENDPOINT,
      credentials: {
        accessKeyId: config.BACKUP_S3_ACCESS_KEY ?? config.S3_ACCESS_KEY,
        secretAccessKey: config.BACKUP_S3_SECRET_KEY ?? config.S3_SECRET_KEY,
      },
    });
    this.sameProvider =
      !config.BACKUP_S3_ENDPOINT || config.BACKUP_S3_ENDPOINT === config.S3_ENDPOINT;
  }

  private get targetBucket(): string {
    return this.config.BACKUP_S3_BUCKET;
  }

  /** Comprueba que el bucket de respaldos existe y es accesible antes de empezar. */
  async assertTargetReachable(): Promise<void> {
    await this.target.send(new HeadBucketCommand({ Bucket: this.targetBucket }));
  }

  async uploadFile(key: string, path: string, contentType: string): Promise<void> {
    const { size } = await stat(path);
    await this.target.send(
      new PutObjectCommand({
        Bucket: this.targetBucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  async putText(key: string, text: string): Promise<void> {
    await this.target.send(
      new PutObjectCommand({
        Bucket: this.targetBucket,
        Key: key,
        Body: text,
        ContentType: 'application/json',
      }),
    );
  }

  async getText(key: string): Promise<string> {
    const response = await this.target.send(
      new GetObjectCommand({ Bucket: this.targetBucket, Key: key }),
    );
    return response.Body!.transformToString();
  }

  async downloadFile(key: string, path: string): Promise<void> {
    const response = await this.target.send(
      new GetObjectCommand({ Bucket: this.targetBucket, Key: key }),
    );
    await pipeline(response.Body as Readable, createWriteStream(path));
  }

  listSource(prefix = ''): Promise<StoredObject[]> {
    return this.listAll(this.source, this.config.S3_BUCKET, prefix);
  }

  listTarget(prefix: string): Promise<StoredObject[]> {
    return this.listAll(this.target, this.targetBucket, prefix);
  }

  async deleteFromTarget(key: string): Promise<void> {
    await this.target.send(new DeleteObjectCommand({ Bucket: this.targetBucket, Key: key }));
  }

  /** Copia un documento del bucket clínico al espejo (mismo proveedor: copia en el servidor). */
  async mirrorObject(key: string, mirrorKey: string): Promise<void> {
    if (this.sameProvider) {
      await this.target.send(
        new CopyObjectCommand({
          Bucket: this.targetBucket,
          Key: mirrorKey,
          CopySource: `${this.config.S3_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`,
        }),
      );
      return;
    }
    const object = await this.source.send(
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
    const body = Buffer.from(await object.Body!.transformToByteArray());
    await this.target.send(
      new PutObjectCommand({
        Bucket: this.targetBucket,
        Key: mirrorKey,
        Body: body,
        ContentType: object.ContentType,
      }),
    );
  }

  /** Restaura un documento del espejo al bucket clínico. */
  async restoreObject(mirrorKey: string, key: string): Promise<void> {
    const object = await this.target.send(
      new GetObjectCommand({ Bucket: this.targetBucket, Key: mirrorKey }),
    );
    const body = Buffer.from(await object.Body!.transformToByteArray());
    await this.source.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: object.ContentType,
      }),
    );
  }

  private async listAll(client: S3Client, bucket: string, prefix: string): Promise<StoredObject[]> {
    const found: StoredObject[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        found.push({
          key: item.Key!,
          size: item.Size ?? 0,
          lastModified: item.LastModified ?? new Date(0),
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return found;
  }
}
