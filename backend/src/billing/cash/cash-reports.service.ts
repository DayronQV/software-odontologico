import { Injectable, NotFoundException } from '@nestjs/common';
import { CashSessionStatus, InvoiceStatus } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { fromCents, toCents } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { computeCashSummary } from '../domain/cash-summary';
import { CashSessionsService } from './cash-sessions.service';

/** Reportes de caja con totales del sistema: solo Administrador y Auditor/Contador. */
@Injectable()
export class CashReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: CashSessionsService,
  ) {}

  async list(query: PaginationQueryDto) {
    const args = pageArgs(query, 20);
    const [total, rows] = await Promise.all([
      this.prisma.db.cashSession.count(),
      this.prisma.db.cashSession.findMany({
        orderBy: { openedAt: 'desc' },
        skip: args.skip,
        take: args.take,
        include: { openedBy: { select: { fullName: true } }, _count: { select: { invoices: true } } },
      }),
    ]);
    return pageResult(
      rows.map((s) => ({
        id: s.id,
        status: s.status,
        openedBy: s.openedBy.fullName,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingFloat: s.openingFloat,
        countedCash: s.countedCash,
        expectedCash: s.expectedCash,
        difference: s.difference,
        invoiceCount: s._count.invoices,
      })),
      total,
      args,
    );
  }

  /** Corte de caja: totales por medio de pago, esperado y diferencia (si ya se contó). */
  async report(id: string) {
    const session = await this.prisma.db.cashSession.findUnique({
      where: { id },
      include: { openedBy: { select: { fullName: true } } },
    });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');

    const [byMethod, issued, voided, movements] = await Promise.all([
      this.prisma.db.payment.groupBy({
        by: ['method'],
        where: { cashSessionId: id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.db.invoice.count({ where: { cashSessionId: id, status: InvoiceStatus.ISSUED } }),
      this.prisma.db.invoice.count({ where: { cashSessionId: id, status: InvoiceStatus.VOIDED } }),
      this.sessions.cashMovements(id),
    ]);

    const openingFloatCents = toCents(Number(session.openingFloat));
    const theoretical = computeCashSummary({
      openingFloatCents,
      ...movements,
      countedCents: toCents(Number(session.countedCash ?? 0)),
    });

    return {
      id: session.id,
      status: session.status,
      openedBy: session.openedBy.fullName,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingFloat: session.openingFloat,
      payments: byMethod.map((row) => ({
        method: row.method,
        count: row._count._all,
        total: row._sum.amount,
      })),
      invoicesIssued: issued,
      invoicesVoided: voided,
      cashRefunds: fromCents(movements.refundsCents),
      expectedCash: fromCents(theoretical.expectedCents),
      countedCash: session.countedCash,
      difference: session.status === CashSessionStatus.CLOSED ? session.difference : null,
      closeNotes: session.closeNotes,
    };
  }
}
