import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashSessionStatus, PaymentMethod, Role } from '@prisma/client';
import { fromCents, toCents } from '../../common/money';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { computeCashSummary } from '../domain/cash-summary';
import type { CloseCashDto, OpenCashDto } from './dto/cash.dto';

/**
 * Sesiones de caja. RN-02 (cierre ciego): la vista de la sesión abierta NO incluye ningún total del
 * sistema; el esperado y la diferencia se calculan y se muestran solo después de recibir el conteo.
 */
@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(user: AuthUser, dto: OpenCashDto) {
    if (await this.findOpen(user.id)) {
      throw new ConflictException('Ya tiene una caja abierta. Ciérrela antes de abrir otra.');
    }
    try {
      const session = await this.prisma.db.cashSession.create({
        data: { openedById: user.id, openingFloat: dto.openingFloat },
      });
      return this.blindView(session.id);
    } catch (error) {
      // Carrera: el índice único parcial (una caja abierta por usuario) la rechazó
      if (/23505|duplicate key|Unique constraint/i.test((error as Error).message)) {
        throw new ConflictException('Ya tiene una caja abierta. Ciérrela antes de abrir otra.');
      }
      throw error;
    }
  }

  /** Caja abierta del usuario, en versión ciega; null si no tiene una. */
  async current(userId: string) {
    const open = await this.findOpen(userId);
    return open ? this.blindView(open.id) : null;
  }

  /** Exige una caja abierta (para poder cobrar). */
  async requireOpen(userId: string) {
    const open = await this.findOpen(userId);
    if (!open) throw new ConflictException('Debe abrir caja antes de cobrar');
    return open;
  }

  /** Cierre: recibe el conteo físico y RECIÉN entonces calcula el esperado y la diferencia. */
  async close(id: string, user: AuthUser, dto: CloseCashDto) {
    const session = await this.prisma.db.cashSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');
    if (session.status !== CashSessionStatus.OPEN) {
      throw new ConflictException('La caja ya está cerrada');
    }
    if (session.openedById !== user.id && user.role !== Role.ADMIN_TI) {
      throw new ForbiddenException('Solo quien abrió la caja puede cerrarla');
    }

    const { cashPaymentsCents, refundsCents } = await this.cashMovements(id);
    const countedCents = toCents(dto.countedCash);
    const { expectedCents, differenceCents } = computeCashSummary({
      openingFloatCents: toCents(Number(session.openingFloat)),
      cashPaymentsCents,
      refundsCents,
      countedCents,
    });

    const closed = await this.prisma.db.cashSession.update({
      where: { id },
      data: {
        status: CashSessionStatus.CLOSED,
        closedAt: new Date(),
        countedCash: dto.countedCash,
        expectedCash: fromCents(expectedCents),
        difference: fromCents(differenceCents),
        closeNotes: dto.notes?.trim(),
      },
    });
    return {
      id: closed.id,
      status: closed.status,
      openedAt: closed.openedAt,
      closedAt: closed.closedAt,
      openingFloat: closed.openingFloat,
      countedCash: closed.countedCash,
      expectedCash: closed.expectedCash,
      difference: closed.difference,
    };
  }

  /** Suma de pagos en efectivo y de devoluciones de una sesión (en centavos). */
  async cashMovements(sessionId: string) {
    const [payments, refunds] = await Promise.all([
      this.prisma.db.payment.aggregate({
        where: { cashSessionId: sessionId, method: PaymentMethod.CASH },
        _sum: { amount: true },
      }),
      this.prisma.db.cashMovement.aggregate({
        where: { cashSessionId: sessionId, type: 'REFUND' },
        _sum: { amount: true },
      }),
    ]);
    return {
      cashPaymentsCents: toCents(Number(payments._sum.amount ?? 0)),
      refundsCents: toCents(Number(refunds._sum.amount ?? 0)),
    };
  }

  private findOpen(userId: string) {
    return this.prisma.db.cashSession.findFirst({
      where: { openedById: userId, status: CashSessionStatus.OPEN },
    });
  }

  /** Vista sin totales del sistema: apertura, fondo y cantidad de comprobantes. */
  private async blindView(id: string) {
    const session = await this.prisma.db.cashSession.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true } } },
    });
    if (!session) throw new BadRequestException('Sesión de caja no encontrada');
    return {
      id: session.id,
      status: session.status,
      openedAt: session.openedAt,
      openingFloat: session.openingFloat,
      invoiceCount: session._count.invoices,
    };
  }
}
