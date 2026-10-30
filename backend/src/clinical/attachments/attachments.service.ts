import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Attachment, AttachmentKind } from '@prisma/client';
import type { AuthUser } from '../../common/types';
import { BlobStorageService, DOWNLOAD_URL_TTL_SECONDS } from '../../files/blob-storage.service';
import { FilesService } from '../../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { validateUpload } from '../domain/attachment-validator';
import { sha256 } from '../domain/signature';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';

export interface UploadInput {
  file: { originalname: string; buffer: Buffer } | undefined;
  kind?: AttachmentKind;
  description?: string;
  appointmentId?: string;
}

/** Radiografías, fotos clínicas y PDFs del paciente (sin DICOM/3D). Cifrados en reposo en MinIO. */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly blobs: BlobStorageService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const rows = await this.prisma.db.attachment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.lookup.userNames(rows.map((r) => r.uploadedById));
    return rows.map((row) => this.toView(row, names));
  }

  async upload(patientId: string, input: UploadInput, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    if (!input.file) throw new BadRequestException('Adjunte un archivo');
    const checked = validateUpload(input.file.originalname, input.file.buffer, input.kind);
    if (!checked.ok) throw new BadRequestException(checked.error);

    const extension = input.file.originalname.split('.').pop()!.toLowerCase();
    const storageKey = `attachments/${patientId}/${randomUUID()}.${extension}`;
    await this.blobs.put(storageKey, input.file.buffer, checked.value.contentType);

    const row = await this.prisma.db.attachment.create({
      data: {
        patientId,
        appointmentId: input.appointmentId ?? null,
        kind: checked.value.kind,
        filename: FilesService.sanitizeFilename(input.file.originalname),
        contentType: checked.value.contentType,
        sizeBytes: input.file.buffer.length,
        storageKey,
        sha256: sha256(input.file.buffer),
        description: input.description?.trim() || null,
        uploadedById: user.id,
      },
    });
    return this.toView(row, new Map([[user.id, user.fullName]]));
  }

  /** Contenido para el visor (imagen con zoom/rotación o vista previa de PDF). */
  async content(patientId: string, id: string) {
    const row = await this.find(patientId, id);
    return { row, buffer: await this.blobs.get(row.storageKey) };
  }

  /** URL firmada que caduca en 60 s, para descargar directo desde el almacenamiento. */
  async downloadUrl(patientId: string, id: string) {
    const row = await this.find(patientId, id);
    const url = await this.blobs.signedUrl(row.storageKey, row.filename, row.contentType);
    return { url, expiresIn: DOWNLOAD_URL_TTL_SECONDS, filename: row.filename };
  }

  private async find(patientId: string, id: string): Promise<Attachment> {
    const row = await this.prisma.db.attachment.findFirst({ where: { id, patientId } });
    if (!row) throw new NotFoundException('Adjunto no encontrado');
    return row;
  }

  private toView(row: Attachment, names: Map<string, string>) {
    return {
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      description: row.description,
      appointmentId: row.appointmentId,
      uploadedBy: names.get(row.uploadedById) ?? null,
      createdAt: row.createdAt,
    };
  }
}
