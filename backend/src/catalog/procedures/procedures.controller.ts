import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../../common/decorators';
import { ALL_ROLES } from '../../common/role-groups';
import { CreateProcedureDto, ProcedureQueryDto, UpdateProcedureDto } from './dto/procedure.dto';
import { ProceduresService } from './procedures.service';

/** Catálogo médico: procedimientos con duración y precios. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/procedures')
export class ProceduresController {
  constructor(private readonly procedures: ProceduresService) {}

  @Roles(...ALL_ROLES)
  @Get()
  list(@Query() query: ProcedureQueryDto) {
    return this.procedures.list(query);
  }

  @Roles(...ALL_ROLES)
  @Get('categories')
  categories() {
    return this.procedures.categories();
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Procedure')
  @Post()
  create(@Body() dto: CreateProcedureDto) {
    return this.procedures.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Procedure')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProcedureDto) {
    return this.procedures.update(id, dto);
  }
}
