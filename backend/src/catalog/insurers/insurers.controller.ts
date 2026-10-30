import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../../common/decorators';
import { ALL_ROLES } from '../../common/role-groups';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { CreateInsurerDto, UpdateInsurerDto } from './dto/insurer.dto';
import { InsurersService } from './insurers.service';

/** Aseguradoras y convenios dentales. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/insurers')
export class InsurersController {
  constructor(private readonly insurers: InsurersService) {}

  @Roles(...ALL_ROLES)
  @Get()
  list(@Query() query: CatalogQueryDto) {
    return this.insurers.list(query);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Insurer')
  @Post()
  create(@Body() dto: CreateInsurerDto) {
    return this.insurers.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('Insurer')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsurerDto) {
    return this.insurers.update(id, dto);
  }
}
