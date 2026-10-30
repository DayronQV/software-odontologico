import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../common/decorators';
import { CLINICAL_STAFF, DENTISTS, PATIENT_STAFF } from '../common/role-groups';
import type { AuthUser } from '../common/types';
import { BudgetApprovalsService } from './approvals/budget-approvals.service';
import { BudgetPdfService } from './budgets/budget-pdf.service';
import { BudgetsService } from './budgets/budgets.service';
import {
  AddItemDto,
  AddPhaseDto,
  AuthorizeDiscountDto,
  CreateBudgetDto,
  CreatePlanDto,
  RequestApprovalDto,
  UpdateItemDto,
} from './dto/treatments.dto';
import { TreatmentPlansService } from './plans/treatment-plans.service';
import { SchedulableItemsService } from './schedulable/schedulable-items.service';

const pdfResponse = ({ buffer, filename }: { buffer: Buffer; filename: string }) =>
  new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="${filename}"` });

/** Planes de tratamiento por fases y sesiones (RF-07). */
@ApiTags('treatments')
@ApiBearerAuth()
@AuditEntity('TreatmentPlan')
@Controller()
export class TreatmentPlansController {
  constructor(private readonly plans: TreatmentPlansService) {}

  @Roles(...CLINICAL_STAFF)
  @Get('patients/:patientId/treatment-plans')
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.plans.list(patientId);
  }

  @Roles(...DENTISTS)
  @Post('patients/:patientId/treatment-plans')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.plans.create(patientId, dto, user);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('treatment-plans/:planId')
  get(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.plans.get(planId);
  }

  @Roles(...DENTISTS)
  @Post('treatment-plans/:planId/phases')
  addPhase(@Param('planId', ParseUUIDPipe) planId: string, @Body() dto: AddPhaseDto) {
    return this.plans.addPhase(planId, dto);
  }

  @Roles(...DENTISTS)
  @Post('treatment-plans/:planId/items')
  addItem(@Param('planId', ParseUUIDPipe) planId: string, @Body() dto: AddItemDto) {
    return this.plans.addItem(planId, dto);
  }

  @Roles(...DENTISTS)
  @Patch('treatment-plans/:planId/items/:itemId')
  updateItem(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.plans.updateItem(planId, itemId, dto);
  }

  /** Solo ítems pendientes que nunca entraron a un presupuesto. */
  @Roles(...DENTISTS)
  @Delete('treatment-plans/:planId/items/:itemId')
  removeItem(@Param('planId', ParseUUIDPipe) planId: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plans.removeItem(planId, itemId);
  }

  @Roles(...DENTISTS)
  @HttpCode(200)
  @Post('treatment-plans/:planId/items/:itemId/cancel')
  cancelItem(@Param('planId', ParseUUIDPipe) planId: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plans.cancelItem(planId, itemId);
  }

  @Roles(...DENTISTS)
  @HttpCode(200)
  @Post('treatment-plans/:planId/close')
  close(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.plans.close(planId);
  }
}

/**
 * Presupuestos y su aprobación (RF-07, RF-08). Los importes los ven el personal clínico y el
 * administrador (que autoriza los descuentos altos).
 */
@ApiTags('treatments')
@ApiBearerAuth()
@AuditEntity('Budget')
@Controller()
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly approvals: BudgetApprovalsService,
    private readonly pdf: BudgetPdfService,
  ) {}

  @Roles(Role.ADMIN_TI)
  @Get('budgets/pending-authorization')
  pendingAuthorization() {
    return this.budgets.pendingAuthorization();
  }

  @Roles(...CLINICAL_STAFF)
  @Get('treatment-plans/:planId/budgets')
  list(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.budgets.listForPlan(planId);
  }

  @Roles(...DENTISTS)
  @Post('treatment-plans/:planId/budgets')
  create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: CreateBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.create(planId, dto, user);
  }

  @Roles(Role.ADMIN_TI, ...CLINICAL_STAFF)
  @Get('budgets/:budgetId')
  get(@Param('budgetId', ParseUUIDPipe) budgetId: string) {
    return this.budgets.get(budgetId);
  }

  @Roles(Role.ADMIN_TI, ...CLINICAL_STAFF)
  @AuditAction('DOWNLOAD')
  @Get('budgets/:budgetId/pdf')
  async budgetPdf(@Param('budgetId', ParseUUIDPipe) budgetId: string) {
    return pdfResponse(await this.pdf.render(budgetId));
  }

  /** Autoriza un descuento por encima del umbral. Solo el administrador. */
  @Roles(Role.ADMIN_TI)
  @HttpCode(200)
  @AuditAction('AUTHORIZE_DISCOUNT')
  @Post('budgets/:budgetId/authorize-discount')
  authorize(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body() dto: AuthorizeDiscountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.authorizeDiscount(budgetId, dto, user);
  }

  /** Prepara la aprobación (total o parcial); después el paciente firma con /signing/:id. */
  @Roles(...CLINICAL_STAFF)
  @Post('budgets/:budgetId/approvals')
  requestApproval(
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body() dto: RequestApprovalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.request(budgetId, dto, user);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('budget-approvals/:approvalId')
  approval(@Param('approvalId', ParseUUIDPipe) approvalId: string) {
    return this.approvals.view(approvalId);
  }

  @Roles(...CLINICAL_STAFF)
  @AuditAction('DOWNLOAD')
  @Get('budget-approvals/:approvalId/pdf')
  async approvalPdf(@Param('approvalId', ParseUUIDPipe) approvalId: string) {
    return pdfResponse(await this.approvals.pdf(approvalId));
  }
}

/** Ítems aprobados que esperan cita: los consulta recepción al agendar (RF-08). */
@ApiTags('treatments')
@ApiBearerAuth()
@Roles(...PATIENT_STAFF)
@AuditEntity('TreatmentItem')
@Controller('patients/:patientId/schedulable-items')
export class SchedulableItemsController {
  constructor(private readonly items: SchedulableItemsService) {}

  @Get()
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.items.list(patientId);
  }
}
