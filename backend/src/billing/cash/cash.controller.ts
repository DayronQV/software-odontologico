import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CASHIERS } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { CashReportsService } from './cash-reports.service';
import { CashSessionsService } from './cash-sessions.service';
import { CloseCashDto, OpenCashDto } from './dto/cash.dto';

/**
 * Caja. Recepción opera con vista ciega (RN-02); los reportes con totales del sistema son del
 * Administrador y del Auditor/Contador.
 */
@ApiTags('billing')
@ApiBearerAuth()
@AuditEntity('CashSession')
@Controller('billing/cash-sessions')
export class CashController {
  constructor(
    private readonly sessions: CashSessionsService,
    private readonly reports: CashReportsService,
  ) {}

  /** Mi caja abierta, sin totales del sistema. `session: null` si no tengo una. */
  @Roles(...CASHIERS)
  @Get('current')
  async current(@CurrentUser() user: AuthUser) {
    return { session: await this.sessions.current(user.id) };
  }

  @Roles(...CASHIERS)
  @HttpCode(201)
  @Post('open')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenCashDto) {
    return this.sessions.open(user, dto);
  }

  /** Cierre ciego: se ingresa el conteo físico y recién entonces se muestran esperado y diferencia. */
  @Roles(...CASHIERS)
  @HttpCode(200)
  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CloseCashDto,
  ) {
    return this.sessions.close(id, user, dto);
  }

  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.reports.list(query);
  }

  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  @Get(':id/report')
  report(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.report(id);
  }
}
