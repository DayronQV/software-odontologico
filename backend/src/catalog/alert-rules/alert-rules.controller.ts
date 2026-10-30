import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../../common/decorators';
import { PATIENT_STAFF } from '../../common/role-groups';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto';

/** Reglas de alerta médica: el administrador las configura; el personal clínico las consulta. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/alert-rules')
export class AlertRulesController {
  constructor(private readonly rules: AlertRulesService) {}

  @Roles(Role.ADMIN_TI, ...PATIENT_STAFF)
  @Get()
  list() {
    return this.rules.list();
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('AlertRule')
  @Post()
  create(@Body() dto: CreateAlertRuleDto) {
    return this.rules.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('AlertRule')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlertRuleDto) {
    return this.rules.update(id, dto);
  }
}
