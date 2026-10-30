import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionEntryKind, Prisma, Role } from '@prisma/client';
import { fromCents, toCents } from '../common/money';
import { pageArgs, pageResult } from '../common/pagination/paginate';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/transaction';
import { calculateCommission, selectRule, type RuleLike } from './domain/commission-calculator';
import type { EntriesQueryDto, RuleDto, SimulateDto } from './dto/commission.dto';

type Db = Pick<Tx, 'consumptionRecipe' | 'procedure' | 'commissionRule'>;
const asRule = (r: { id: string; procedureId: string | null; mode: RuleLike['mode']; value: Prisma.Decimal; validFrom: Date; validTo: Date | null; priority: number; active: boolean }): RuleLike => ({ ...r, value: Number(r.value) });

/** Reglas de comisión por profesional (RF-13), devengo al cobrar y reversión al anular. */
@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------- reglas
  async listRules(professionalId?: string) {
    const rules = await this.prisma.db.commissionRule.findMany({ where: professionalId ? { professionalId } : {}, orderBy: [{ professionalId: 'asc' }, { priority: 'desc' }, { validFrom: 'desc' }] });
    const [names, procedures] = await Promise.all([this.professionalNames(rules.map((r) => r.professionalId)), this.prisma.db.procedure.findMany({ select: { id: true, name: true } })]);
    const procedureName = new Map(procedures.map((p) => [p.id, p.name]));
    return rules.map((r) => ({ ...r, professional: names.get(r.professionalId) ?? null, procedure: r.procedureId ? (procedureName.get(r.procedureId) ?? null) : null }));
  }

  async saveRule(dto: RuleDto, id?: string) {
    if (dto.mode !== 'FIXED_AMOUNT' && dto.value > 100) throw new BadRequestException('El porcentaje no puede superar 100');
    if (dto.validTo && new Date(dto.validTo) < new Date(dto.validFrom)) throw new BadRequestException('La vigencia termina antes de empezar');
    if (!(await this.prisma.db.professional.findUnique({ where: { id: dto.professionalId } }))) throw new NotFoundException('Profesional no encontrado');
    if (dto.procedureId && !(await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } }))) throw new NotFoundException('Procedimiento no encontrado');
    const data = {
      professionalId: dto.professionalId,
      procedureId: dto.procedureId ?? null,
      mode: dto.mode,
      value: dto.value,
      validFrom: new Date(dto.validFrom),
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      priority: dto.priority ?? 0,
      active: dto.active ?? true,
    };
    if (!id) return this.prisma.db.commissionRule.create({ data });
    if (!(await this.prisma.db.commissionRule.findUnique({ where: { id } }))) throw new NotFoundException('Regla no encontrada');
    return this.prisma.db.commissionRule.update({ where: { id }, data });
  }

  // ------------------------------------------------------------------ simulación
  /** Calcula una comisión sin guardar nada (para probar reglas o explicársela al profesional). */
  async simulate(dto: SimulateDto) {
    const procedure = await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } });
    if (!procedure) throw new NotFoundException('Procedimiento no encontrado');
    const quantity = dto.quantity ?? 1;
    const rules = (await this.prisma.db.commissionRule.findMany({ where: { professionalId: dto.professionalId } })).map(asRule);
    const rule = dto.mode && dto.value !== undefined ? { id: null, mode: dto.mode, value: dto.value } : selectRule(rules, dto.procedureId, new Date());
    if (!rule) return { rule: null, commission: 0, message: 'El profesional no tiene una regla vigente para este procedimiento' };
    const costs = await this.costs(this.prisma.db, dto.procedureId, quantity);
    const baseCents = toCents(dto.price ?? Number(procedure.basePrice) * quantity);
    const result = calculateCommission({ mode: rule.mode, value: rule.value, baseCents, ...costs, quantity });
    return {
      rule: { id: rule.id, mode: rule.mode, value: rule.value },
      price: fromCents(baseCents),
      labCost: fromCents(costs.labCents),
      materialsCost: fromCents(costs.materialsCents),
      calculationBase: fromCents(result.calculationBaseCents),
      commission: fromCents(result.commissionCents),
    };
  }

  // -------------------------------------------------- devengo y reversión (facturas)
  /** Devenga la comisión de cada línea cobrada con procedimiento. Idempotente por línea. */
  async accrueForInvoice(tx: Tx, invoiceId: string): Promise<number> {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: true, appointment: { select: { professionalId: true } } },
    });
    const professionalId = invoice.appointment?.professionalId;
    if (!professionalId) return 0;
    const rules = (await tx.commissionRule.findMany({ where: { professionalId } })).map(asRule);
    let created = 0;
    for (const line of invoice.lines) {
      if (!line.procedureId) continue;
      const rule = selectRule(rules, line.procedureId, invoice.createdAt);
      if (!rule) continue;
      const costs = await this.costs(tx, line.procedureId, line.quantity);
      const baseCents = toCents(Number(line.netAmount));
      const result = calculateCommission({ mode: rule.mode, value: rule.value, baseCents, ...costs, quantity: line.quantity });
      await tx.commissionEntry.upsert({
        where: { invoiceLineId_kind: { invoiceLineId: line.id, kind: CommissionEntryKind.ACCRUAL } },
        update: {},
        create: {
          professionalId,
          invoiceId,
          invoiceLineId: line.id,
          procedureId: line.procedureId,
          ruleId: rule.id,
          kind: CommissionEntryKind.ACCRUAL,
          baseAmount: fromCents(baseCents),
          labCost: fromCents(costs.labCents),
          materialsCost: fromCents(costs.materialsCents),
          amount: fromCents(result.commissionCents),
        },
      });
      created++;
    }
    return created;
  }

  /** La anulación de la factura (nota de crédito) revierte lo devengado, sin borrar nada. */
  async reverseForInvoice(tx: Tx, invoiceId: string): Promise<number> {
    const accruals = await tx.commissionEntry.findMany({ where: { invoiceId, kind: CommissionEntryKind.ACCRUAL } });
    let reversed = 0;
    for (const entry of accruals) {
      const exists = await tx.commissionEntry.findUnique({ where: { invoiceLineId_kind: { invoiceLineId: entry.invoiceLineId, kind: CommissionEntryKind.REVERSAL } } });
      if (exists) continue;
      await tx.commissionEntry.create({
        data: {
          professionalId: entry.professionalId,
          invoiceId,
          invoiceLineId: entry.invoiceLineId,
          procedureId: entry.procedureId,
          ruleId: entry.ruleId,
          kind: CommissionEntryKind.REVERSAL,
          baseAmount: entry.baseAmount,
          labCost: entry.labCost,
          materialsCost: entry.materialsCost,
          amount: new Prisma.Decimal(entry.amount).negated(),
        },
      });
      reversed++;
    }
    return reversed;
  }

  // ------------------------------------------------------------------- consultas
  /** El odontólogo solo ve lo suyo; auditor y administrador ven todo. */
  async scopeProfessional(user: AuthUser, requested?: string): Promise<string | undefined> {
    if (user.role !== Role.ODONTOLOGO) return requested;
    const own = await this.prisma.db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!own) throw new ForbiddenException('Su usuario no tiene un perfil de profesional');
    if (requested && requested !== own.id) throw new ForbiddenException('Solo puede consultar sus propias comisiones');
    return own.id;
  }

  async entries(query: EntriesQueryDto, professionalId?: string) {
    const args = pageArgs(query, 25);
    const where: Prisma.CommissionEntryWhereInput = {
      ...(professionalId && { professionalId }),
      ...((query.from || query.to) && { createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lt: new Date(new Date(query.to).getTime() + 86_400_000) }) } }),
    };
    const [total, rows, sums] = await Promise.all([
      this.prisma.db.commissionEntry.count({ where }),
      this.prisma.db.commissionEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: args.skip, take: args.take }),
      this.prisma.db.commissionEntry.aggregate({ where, _sum: { amount: true } }),
    ]);
    const [names, procedures, invoices] = await Promise.all([
      this.professionalNames(rows.map((r) => r.professionalId)),
      this.prisma.db.procedure.findMany({ where: { id: { in: rows.flatMap((r) => (r.procedureId ? [r.procedureId] : [])) } }, select: { id: true, name: true } }),
      this.prisma.db.invoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId) } }, select: { id: true, number: true } }),
    ]);
    const procedureName = new Map(procedures.map((p) => [p.id, p.name]));
    const invoiceNumber = new Map(invoices.map((i) => [i.id, i.number]));
    return {
      ...pageResult(
        rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          professional: names.get(r.professionalId) ?? null,
          procedure: r.procedureId ? (procedureName.get(r.procedureId) ?? null) : null,
          invoiceNumber: invoiceNumber.get(r.invoiceId) ?? null,
          kind: r.kind,
          baseAmount: Number(r.baseAmount),
          labCost: Number(r.labCost),
          materialsCost: Number(r.materialsCost),
          amount: Number(r.amount),
          settled: !!r.settlementId,
        })),
        total,
        args,
      ),
      totalAmount: Number(sums._sum.amount ?? 0),
    };
  }

  async professionalNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.db.professional.findMany({ where: { id: { in: [...new Set(ids)] } }, include: { user: { select: { fullName: true } } } });
    return new Map(rows.map((p) => [p.id, p.user.fullName]));
  }

  /** Costos de laboratorio y de materiales (receta de consumo × costo del insumo) de un procedimiento. */
  private async costs(db: Db, procedureId: string, quantity: number) {
    const [procedure, recipe] = await Promise.all([
      db.procedure.findUniqueOrThrow({ where: { id: procedureId } }),
      db.consumptionRecipe.findMany({ where: { procedureId }, include: { item: true } }),
    ]);
    const materials = recipe.reduce((sum, r) => sum + Number(r.quantity) * Number(r.item.unitCost), 0);
    return { labCents: toCents(Number(procedure.labCost) * quantity), materialsCents: toCents(materials * quantity) };
  }
}
