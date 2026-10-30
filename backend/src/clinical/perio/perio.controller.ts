import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF, DENTISTS } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { CompareQueryDto, SavePerioChartDto } from './dto/perio.dto';
import { PerioService } from './perio.service';

/** Periodontograma (RF-04). Lo capturan los odontólogos; el personal clínico lo consulta. */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('PerioChart')
@Controller('patients/:patientId/perio-charts')
export class PerioController {
  constructor(private readonly service: PerioService) {}

  @Roles(...CLINICAL_STAFF)
  @Get()
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.service.list(patientId);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('compare')
  compare(@Param('patientId', ParseUUIDPipe) patientId: string, @Query() query: CompareQueryDto) {
    return this.service.compare(patientId, query.before, query.after);
  }

  @Roles(...CLINICAL_STAFF)
  @Get(':chartId')
  get(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('chartId', ParseUUIDPipe) chartId: string,
  ) {
    return this.service.get(patientId, chartId);
  }

  @Roles(...DENTISTS)
  @Post()
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: SavePerioChartDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(patientId, dto, user);
  }

  @Roles(...DENTISTS)
  @Put(':chartId')
  update(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('chartId', ParseUUIDPipe) chartId: string,
    @Body() dto: SavePerioChartDto,
  ) {
    return this.service.update(patientId, chartId, dto);
  }

  @Roles(...DENTISTS)
  @HttpCode(200)
  @Post(':chartId/finalize')
  finalize(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('chartId', ParseUUIDPipe) chartId: string,
  ) {
    return this.service.finalize(patientId, chartId);
  }
}
