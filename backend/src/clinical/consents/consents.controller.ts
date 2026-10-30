import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { ConsentTemplatesService } from './consent-templates.service';
import { ConsentsService } from './consents.service';
import { ConsentTemplateQueryDto, CreateConsentDto, CreateConsentTemplateDto } from './dto/consent.dto';

/** Consentimientos informados de un paciente (RF-06). */
@ApiTags('clinical')
@ApiBearerAuth()
@Roles(...CLINICAL_STAFF)
@AuditEntity('PatientConsent')
@Controller()
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get('patients/:patientId/consents')
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.consents.list(patientId);
  }

  /** Genera el documento a partir de la plantilla vigente; después se firma con /signing/:id. */
  @Post('patients/:patientId/consents')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateConsentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consents.create(patientId, dto, user);
  }

  @Get('consents/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.consents.get(id);
  }

  @AuditAction('DOWNLOAD')
  @Get('consents/:id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.consents.pdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }
}

/** Plantillas legales por procedimiento: las edita el administrador; el personal clínico las usa. */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('ConsentTemplate')
@Controller('clinical/consent-templates')
export class ConsentTemplatesController {
  constructor(private readonly templates: ConsentTemplatesService) {}

  @Roles(Role.ADMIN_TI, ...CLINICAL_STAFF)
  @Get()
  list(@Query() query: ConsentTemplateQueryDto) {
    return this.templates.list(query.procedureId);
  }

  /** Crea una versión nueva (la anterior queda inactiva, sin perder el historial). */
  @Roles(Role.ADMIN_TI)
  @Post()
  create(@Body() dto: CreateConsentTemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.create(dto, user);
  }
}
