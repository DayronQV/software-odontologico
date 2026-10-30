import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { DashboardService } from './dashboard.service';
import { ExportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

/** Reportes BI: administración y contabilidad ven todo; el odontólogo solo sus indicadores. Recepción no entra. */
@ApiTags('reports')
@ApiBearerAuth()
@AuditEntity('Report')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly dashboard: DashboardService,
  ) {}

  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.ODONTOLOGO)
  @Get()
  catalog(@CurrentUser() user: AuthUser) {
    return this.reports.available(user);
  }

  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  @Get('dashboard')
  panel(@Query() query: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboard.get(query, user);
  }

  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.ODONTOLOGO)
  @Get(':key')
  run(@Param('key') key: string, @Query() query: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.run(key, query, user);
  }

  /** Cada exportación (PDF o CSV) queda registrada en el log de auditoría inmutable (RNF-06). */
  @Roles(Role.ADMIN_TI, Role.AUDITOR, Role.ODONTOLOGO)
  @AuditAction('EXPORT')
  @Get(':key/export')
  async export(@Param('key') key: string, @Query() query: ExportQueryDto, @CurrentUser() user: AuthUser) {
    const { buffer, filename, contentType } = await this.reports.export(key, query.format, query, user);
    return new StreamableFile(buffer, { type: contentType, disposition: `attachment; filename="${filename}"` });
  }
}
