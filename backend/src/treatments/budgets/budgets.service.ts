import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetStatus, TreatmentItemStatus } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { ClinicalLookupService } from '../../clinical/shared/clinical-lookup.service';
import { fromCents, toCents } from '../../common/money';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateBudget,
  requiresDiscountAuthorization,
  type BudgetLineInput,
} from '../domain/budget-calculator';
import type { AuthorizeDiscountDto, CreateBudgetDto } from '../dto/treatments.dto';
import { BUDGET_INCLUDE, toBudgetView, type BudgetRow } from './budget-view.mapper';

const OPEN_STATUSES: BudgetStatus[] = [BudgetStatus.OPEN, BudgetStatus.PENDING_AUTHORIZATION];

/** Presupuestos versionados de un plan: honorarios, laboratorio y descuentos autorizados (RF-07). */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly settings: SettingsService,
  ) {}

  async listForPlan(planId: string) {
    const rows = await this.prisma.db.budget.findMany({
      where: { planId },
      orderBy: { version: 'desc' },
      include: BUDGET_INCLUDE,
    });
    return this.withNames(rows);
  }

  async get(budgetId: string) {
    const row = await this.findOne(budgetId);
    const [view] = await this.withNames([row]);
    return view;
  }

  /** Presupuestos con un descuento que espera autorización (para el administrador). */
  async pendingAuthorization() {
    const rows = await this.prisma.db.budget.findMany({
      where: { status: BudgetStatus.PENDING_AUTHORIZATION },
      orderBy: { createdAt: 'asc' },
      include: BUDGET_INCLUDE,
    });
    return this.withNames(rows);
  }

  /**
   * Nueva versión del presupuesto: foto del plan en este momento. Las versiones anteriores todavía
   * abiertas pasan a "reemplazadas"; las ya aprobadas se conservan como están.
   */
  async create(planId: string, dto: CreateBudgetDto, user: AuthUser) {
    const plan = await this.prisma.db.treatmentPlan.findUnique({
      where: { id: planId },
      include: { phases: { include: { items: { include: { procedure: { select: { name: true } } } } } } },
    });
    if (!plan) throw new NotFoundException('Plan de tratamiento no encontrado');
    await this.lookup.assertPatient(plan.patientId);

    const items = plan.phases.flatMap((phase) =>
      phase.items
        .filter((item) => item.status !== TreatmentItemStatus.CANCELED)
        .map((item) => ({ item, phase })),
    );
    if (items.length === 0) throw new BadRequestException('El plan no tiene ítems para presupuestar');

    const discountPercent = dto.discountPercent ?? 0;
    const { maxDiscountPercent } = await this.settings.get();
    const needsAuthorization = requiresDiscountAuthorization(discountPercent, Number(maxDiscountPercent));

    const lines: BudgetLineInput[] = items.map(({ item, phase }) => ({
      itemId: item.id,
      phasePosition: phase.position,
      phaseName: phase.name,
      feeCents: toCents(Number(item.fee)),
      labCents: toCents(Number(item.labCost)),
    }));
    const totals = calculateBudget(lines, discountPercent);

    const created = await this.prisma.db.$transaction(async (tx) => {
      const latest = await tx.budget.findFirst({
        where: { planId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await tx.budget.updateMany({
        where: { planId, status: { in: OPEN_STATUSES } },
        data: { status: BudgetStatus.SUPERSEDED },
      });
      return tx.budget.create({
        data: {
          planId,
          version: (latest?.version ?? 0) + 1,
          status: needsAuthorization ? BudgetStatus.PENDING_AUTHORIZATION : BudgetStatus.OPEN,
          subtotalFees: fromCents(totals.feesCents),
          subtotalLab: fromCents(totals.labCents),
          discountPercent,
          discountAmount: fromCents(totals.discountCents),
          total: fromCents(totals.totalCents),
          createdById: user.id,
          lines: {
            create: items.map(({ item, phase }) => ({
              itemId: item.id,
              phaseName: phase.name,
              phasePosition: phase.position,
              description:
                item.procedure.name + (item.toothCode ? ` — diente ${item.toothCode}` : ''),
              toothCode: item.toothCode,
              fee: item.fee,
              labCost: item.labCost,
            })),
          },
        },
        include: BUDGET_INCLUDE,
      });
    });
    const [view] = await this.withNames([created]);
    return view;
  }

  /** Un descuento por encima del umbral lo autoriza el administrador (nunca quien lo propone). */
  async authorizeDiscount(budgetId: string, dto: AuthorizeDiscountDto, user: AuthUser) {
    const budget = await this.findOne(budgetId);
    if (budget.status !== BudgetStatus.PENDING_AUTHORIZATION) {
      throw new ConflictException('Este presupuesto no espera autorización de descuento');
    }
    await this.prisma.db.budget.update({
      where: { id: budgetId },
      data: {
        status: BudgetStatus.OPEN,
        discountAuthorizedById: user.id,
        discountAuthorizedAt: new Date(),
        discountAuthorizationNote: dto.note.trim(),
      },
    });
    return this.get(budgetId);
  }

  async findOne(budgetId: string): Promise<BudgetRow> {
    const row = await this.prisma.db.budget.findUnique({ where: { id: budgetId }, include: BUDGET_INCLUDE });
    if (!row) throw new NotFoundException('Presupuesto no encontrado');
    return row;
  }

  private async withNames(rows: BudgetRow[]) {
    const names = await this.lookup.userNames(
      rows.flatMap((r) => [r.createdById, r.discountAuthorizedById]),
    );
    return rows.map((row) => toBudgetView(row, names));
  }
}
