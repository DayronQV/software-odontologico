import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../common/decorators';
import { DownloadUrlQueryDto, UploadUrlDto } from './dto/files.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@Roles(Role.ADMIN_TI, Role.ODONTOLOGO, Role.ASISTENTE)
@AuditEntity('File')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** URL firmada (PUT) para subir un archivo directo al almacenamiento. */
  @HttpCode(200)
  @Post('upload-url')
  uploadUrl(@Body() dto: UploadUrlDto) {
    return this.files.createUploadUrl(dto.filename, dto.contentType);
  }

  /** URL firmada (GET) de corta duración para descargar un archivo. */
  @Get('download-url')
  downloadUrl(@Query() query: DownloadUrlQueryDto) {
    return this.files.createDownloadUrl(query.key);
  }
}
