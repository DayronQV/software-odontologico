import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AttachmentKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { MAX_ATTACHMENT_BYTES } from '../domain/attachment-validator';
import { AttachmentsService } from './attachments.service';

class UploadAttachmentDto {
  @IsOptional()
  @IsEnum(AttachmentKind)
  kind?: AttachmentKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}

/** Adjuntos del paciente. Cada subida, vista y descarga queda en la auditoría. */
@ApiTags('clinical')
@ApiBearerAuth()
@Roles(...CLINICAL_STAFF)
@AuditEntity('Attachment')
@Controller('patients/:patientId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.attachments.list(patientId);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: Object.values(AttachmentKind) },
        description: { type: 'string' },
        appointmentId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  @Post()
  upload(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.upload(patientId, { file, ...body }, user);
  }

  /** Contenido para el visor integrado (imagen o PDF). */
  @AuditAction('VIEW')
  @Get(':id/content')
  async content(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { row, buffer } = await this.attachments.content(patientId, id);
    return new StreamableFile(buffer, {
      type: row.contentType,
      disposition: `inline; filename="${row.filename}"`,
    });
  }

  /** URL firmada de vida corta (60 s) para descargar. */
  @AuditAction('DOWNLOAD')
  @Get(':id/download-url')
  downloadUrl(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attachments.downloadUrl(patientId, id);
  }
}
