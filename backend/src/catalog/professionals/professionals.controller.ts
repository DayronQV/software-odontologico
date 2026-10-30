import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { ALL_ROLES } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import {
  CreateProfessionalDto,
  ReplaceScheduleDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Roles(...ALL_ROLES)
  @Get()
  list(@Query() query: CatalogQueryDto) {
    return this.professionals.list(query);
  }

  /** El profesional del odontólogo autenticado (para pre-filtrar su agenda). */
  @Roles(Role.ODONTOLOGO)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.professionals.findByUserId(user.id);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Professional')
  @Post()
  create(@Body() dto: CreateProfessionalDto) {
    return this.professionals.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Professional')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProfessionalDto) {
    return this.professionals.update(id, dto);
  }

  /** Reemplaza el horario laboral semanal. */
  @Roles(Role.ADMIN_TI)
  @AuditEntity('ProfessionalSchedule')
  @Put(':id/schedule')
  replaceSchedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceScheduleDto) {
    return this.professionals.replaceSchedule(id, dto.slots);
  }
}
