import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../../common/decorators';
import { ALL_ROLES } from '../../common/role-groups';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { CreateOfficeDto, UpdateOfficeDto } from './dto/office.dto';
import { OfficesService } from './offices.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  /** Consultorios con sus sillones. */
  @Roles(...ALL_ROLES)
  @Get()
  list(@Query() query: CatalogQueryDto) {
    return this.offices.list(query);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Office')
  @Post()
  create(@Body() dto: CreateOfficeDto) {
    return this.offices.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Office')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOfficeDto) {
    return this.offices.update(id, dto);
  }
}
