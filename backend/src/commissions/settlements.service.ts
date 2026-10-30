import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import { SettingsService } from '../catalog/settings/settings.service';
import { formatLocalDateTime } from '../common/local-time';
import { pdfHeader, renderPdf } from '../common/pdf';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionsService } from './commissions.service';
import type { CreateSettlementDto } from './dto/commission.dto';

const day = (date: Date) => date.toISOString().slice(0, 10);
export const settlementNumber = (n: number) => `LIQ-${String(n).padStart(5, '0')}`;

/** Liquidación de honorarios por período y profesional: borrador → aprobada → pagada, con comprobante PDF. */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
    private readonly settings: SettingsService,
  ) {}

  async list(professionalId?: string, onlyFinal = false) {
    const rows = await this.prisma.db.commissionSettlement.findMany({
      where: { ...(professionalId && { professionalId }), ...(onlyFinal && { status: { in: [SettlementStatus.APPROVED, SettlementStatus.PAID] } }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const names = await this.commissions.professionalNames(rows.map((r) => r.professionalId));
    return rows.map((r) => this.view(r, names.get(r.professionalId) ?? null));
  }

  async get(id: string, professionalId?: string) {
    const settlement = await this.prisma.db.commissionSettlement.findUnique({ where: { id }, include: { entries: { orderBy: { createdAt: 'asc' } } } });
    if (!settlement || (professionalId && (settlement.professionalId !== professionalId || settlement.status === SettlementStatus.DRAFT))) {
      throw new NotFoundException('Liquidación no encontrada');
    }
    const [names, procedures] = await Promise.all([
      this.commissions.professionalNames([settlement.professionalId]),
      this.prisma.db.procedure.findMany({ select: { id: true, name: true } }),
    ]);
    const procedureName = new Map(procedures.map((p) => [p.id, p.name]));
    return {
      ...this.view(settlement, names.get(settlement.professionalId) ?? null),
      entries: settlement.entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        kind: e.kind,
        procedure: e.procedureId ? (procedureName.get(e.procedureId) ?? null) : null,
        baseAmount: Number(e.baseAmount),
        labCost: Number(e.labCost),
        materialsCost: Number(e.materialsCost),
        amount: Number(e.amount),
      })),
    };
  }

  /** Reúne las comisiones todavía sin liquidar del período (reversiones incluidas) en un borrador. */
  async create(dto: CreateSettlementDto, user: AuthUser) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (end < start) throw new BadRequestException('El período termina antes de empezar');
    if (!(await this.prisma.db.professional.findUnique({ where: { id: dto.professionalId } }))) throw new NotFoundException('Profesional no encontrado');

    const created = await this.prisma.db.$transaction(async (tx) => {
      const entries = await tx.commissionEntry.findMany({
        where: { professionalId: dto.professionalId, settlementId: null, createdAt: { gte: start, lt: new Date(end.getTime() + 86_400_000) } },
      });
      if (entries.length === 0) throw new ConflictException('No hay comisiones pendientes de liquidar en ese período');
      const total = entries.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
      const settlement = await tx.commissionSettlement.create({
        data: { professionalId: dto.professionalId, periodStart: start, periodEnd: end, total, createdById: user.id },
      });
      await tx.commissionEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { settlementId: settlement.id } });
      return settlement;
    });
    return this.get(created.id);
  }

  async approve(id: string, user: AuthUser) {
    await this.transition(id, SettlementStatus.DRAFT, { status: SettlementStatus.APPROVED, approvedById: user.id, approvedAt: new Date() });
    return this.get(id);
  }

  async pay(id: string, user: AuthUser) {
    await this.transition(id, SettlementStatus.APPROVED, { status: SettlementStatus.PAID, paidById: user.id, paidAt: new Date() });
    return this.get(id);
  }

  /** Un borrador se puede descartar: sus comisiones vuelven a quedar pendientes. */
  async discard(id: string) {
    const settlement = await this.find(id);
    if (settlement.status !== SettlementStatus.DRAFT) throw new ConflictException('Solo se descartan liquidaciones en borrador');
    await this.prisma.db.$transaction([
      this.prisma.db.commissionEntry.updateMany({ where: { settlementId: id }, data: { settlementId: null } }),
      this.prisma.db.commissionSettlement.delete({ where: { id } }),
    ]);
    return { id, discarded: true };
  }

  async pdf(id: string, professionalId?: string): Promise<{ buffer: Buffer; filename: string }> {
    const settlement = await this.get(id, professionalId);
    const clinic = await this.settings.get();
    const number = settlementNumber(settlement.number);
    const money = (v: number) => `${v.toFixed(2)} ${clinic.currency}`;
    const buffer = await renderPdf((doc) => {
      pdfHeader(doc, clinic.clinicName, `Liquidación de honorarios ${number}`);
      doc.text(`Profesional: ${settlement.professional}`).text(`Período: ${settlement.periodStart} al ${settlement.periodEnd}`).text(`Estado: ${{ DRAFT: 'Borrador', APPROVED: 'Aprobada', PAID: 'Pagada' }[settlement.status]}`);
      if (settlement.paidAt) doc.text(`Pagada el ${formatLocalDateTime(settlement.paidAt, clinic.timezone)}`);
      doc.moveDown().fontSize(11).text('Detalle', { underline: true }).fontSize(9);
      for (const e of settlement.entries) {
        doc.text(`${formatLocalDateTime(e.createdAt, clinic.timezone)} · ${e.kind === 'REVERSAL' ? 'REVERSIÓN ' : ''}${e.procedure ?? '—'} · base ${money(e.baseAmount)} · lab. ${money(e.labCost)} · mat. ${money(e.materialsCost)} → ${money(e.amount)}`);
      }
      doc.moveDown().fontSize(12).text(`Total a pagar: ${money(settlement.total)}`, { align: 'right' });
    });
    return { buffer, filename: `${number}.pdf` };
  }

  private view(s: { id: string; number: number; professionalId: string; periodStart: Date; periodEnd: Date; status: SettlementStatus; total: Prisma.Decimal; createdAt: Date; approvedAt: Date | null; paidAt: Date | null }, professional: string | null) {
    return { id: s.id, number: s.number, displayNumber: settlementNumber(s.number), professionalId: s.professionalId, professional, periodStart: day(s.periodStart), periodEnd: day(s.periodEnd), status: s.status, total: Number(s.total), createdAt: s.createdAt, approvedAt: s.approvedAt, paidAt: s.paidAt };
  }

  private async find(id: string) {
    const settlement = await this.prisma.db.commissionSettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    return settlement;
  }

  private async transition(id: string, from: SettlementStatus, data: Prisma.CommissionSettlementUpdateInput) {
    const result = await this.prisma.db.commissionSettlement.updateMany({ where: { id, status: from }, data: data as Prisma.CommissionSettlementUpdateManyMutationInput });
    if (result.count === 0) {
      await this.find(id);
      throw new ConflictException('El estado de la liquidación no permite esta operación');
    }
  }
}
