import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { CommissionsService } from './commissions.service';
import { CreateSettlementDto, EntriesQueryDto, RuleDto, SimulateDto } from './dto/commission.dto';
import { SettlementsService } from './settlements.service';

/** Contabilidad y administración ven todo; el odontólogo solo lo suyo. Recepción no entra. */
const FINANCE = [Role.ADMIN_TI, Role.AUDITOR];

@ApiTags('commissions')
@ApiBearerAuth()
@AuditEntity('Commission')
@Controller('commissions')
export class CommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly settlements: SettlementsService,
  ) {}

  @Roles(...FINANCE)
  @Get('rules')
  rules(@Query('professionalId') professionalId?: string) {
    return this.commissions.listRules(professionalId);
  }

  @Roles(Role.ADMIN_TI)
  @Post('rules')
  createRule(@Body() dto: RuleDto) {
    return this.commissions.saveRule(dto);
  }

  @Roles(Role.ADMIN_TI)
  @Put('rules/:id')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleDto) {
    return this.commissions.saveRule(dto, id);
  }

  @Roles(...FINANCE)
  @HttpCode(200)
  @AuditAction('SIMULATE')
  @Post('simulate')
  simulate(@Body() dto: SimulateDto) {
    return this.commissions.simulate(dto);
  }

  @Roles(...FINANCE, Role.ODONTOLOGO)
  @Get('entries')
  async entries(@Query() query: EntriesQueryDto, @CurrentUser() user: AuthUser) {
    return this.commissions.entries(query, await this.commissions.scopeProfessional(user, query.professionalId));
  }

  @Roles(...FINANCE, Role.ODONTOLOGO)
  @Get('settlements')
  async settlementList(@CurrentUser() user: AuthUser, @Query('professionalId') professionalId?: string) {
    const own = await this.commissions.scopeProfessional(user, professionalId);
    return this.settlements.list(own, user.role === Role.ODONTOLOGO);
  }

  @Roles(...FINANCE, Role.ODONTOLOGO)
  @Get('settlements/:id')
  async settlement(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.get(id, user.role === Role.ODONTOLOGO ? await this.commissions.scopeProfessional(user) : undefined);
  }

  @Roles(...FINANCE, Role.ODONTOLOGO)
  @AuditAction('DOWNLOAD')
  @Get('settlements/:id/pdf')
  async settlementPdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const { buffer, filename } = await this.settlements.pdf(id, user.role === Role.ODONTOLOGO ? await this.commissions.scopeProfessional(user) : undefined);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="${filename}"` });
  }

  @Roles(...FINANCE)
  @Post('settlements')
  createSettlement(@Body() dto: CreateSettlementDto, @CurrentUser() user: AuthUser) {
    return this.settlements.create(dto, user);
  }

  @Roles(...FINANCE)
  @HttpCode(200)
  @AuditAction('APPROVE')
  @Post('settlements/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.approve(id, user);
  }

  @Roles(...FINANCE)
  @HttpCode(200)
  @AuditAction('PAY')
  @Post('settlements/:id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.pay(id, user);
  }

  /** Solo un borrador se descarta; aprobadas y pagadas son inmutables. */
  @Roles(...FINANCE)
  @Delete('settlements/:id')
  discard(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.discard(id);
  }
}
