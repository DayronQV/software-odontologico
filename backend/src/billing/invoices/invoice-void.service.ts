import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { toCents, fromCents } from '../../common/money';
import type { AuthUser } from '../../common/types';
import {
  FISCAL_INVOICE_PROVIDER,
  type FiscalInvoiceProvider,
} from '../../integrations/fiscal/fiscal-invoice-provider';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../integrations/payments/payment-gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { CashSessionsService } from '../cash/cash-sessions.service';
import { CARD_METHODS } from '../domain/payments-validator';
import { InvoicesQueryService } from './invoices-query.service';

/**
 * Anulación de un comprobante: nunca se borra; se emite una nota de crédito, se devuelve el
 * efectivo desde la caja de quien anula y se revierten los cobros con tarjeta.
 */
@Injectable()
export class InvoiceVoidService {
  private readonly logger = new Logger(InvoiceVoidService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashSessionsService,
    private readonly query: InvoicesQueryService,
    @Inject(FISCAL_INVOICE_PROVIDER) private readonly fiscal: FiscalInvoiceProvider,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async void(id: string, reason: string, user: AuthUser) {
    const invoice = await this.prisma.db.invoice.findUnique({
      where: { id },
      include: { payments: true, patient: { select: { firstName: true, lastName: true, documentId: true } } },
    });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    if (invoice.status === InvoiceStatus.VOIDED) throw new ConflictException('El comprobante ya fue anulado');

    const cashCents = invoice.payments
      .filter((p) => p.method === PaymentMethod.CASH)
      .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
    // El efectivo devuelto sale de la caja de quien anula, por eso debe tenerla abierta
    const session = cashCents > 0 ? await this.cash.requireOpen(user.id) : null;

    const creditNote = await this.prisma.db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: reason.trim(),
          voidedById: user.id,
        },
      });
      if (session) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: session.id,
            type: 'REFUND',
            amount: fromCents(cashCents),
            invoiceId: id,
            createdById: user.id,
          },
        });
      }
      return tx.creditNote.create({
        data: { invoiceId: id, reason: reason.trim(), total: invoice.total, issuedById: user.id },
      });
    });

    await this.reverseCardPayments(invoice.payments);
    await this.authorizeCreditNote(creditNote.id, invoice);
    return this.query.findOne(id);
  }

  private async reverseCardPayments(
    payments: { method: PaymentMethod; gatewayTransactionId: string | null }[],
  ): Promise<void> {
    for (const payment of payments) {
      if (!CARD_METHODS.includes(payment.method) || !payment.gatewayTransactionId) continue;
      try {
        await this.gateway.reverse(payment.gatewayTransactionId);
      } catch (error) {
        this.logger.error(`No se pudo revertir ${payment.gatewayTransactionId}: ${(error as Error).message}`);
      }
    }
  }

  private async authorizeCreditNote(
    creditNoteId: string,
    invoice: {
      number: number;
      currency: string;
      netTotal: unknown;
      taxTotal: unknown;
      total: unknown;
      fiscalFolio: string | null;
      patient: { firstName: string; lastName: string; documentId: string | null };
    },
  ): Promise<void> {
    const note = await this.prisma.db.creditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
    try {
      const authorization = await this.fiscal.authorize({
        kind: 'CREDIT_NOTE',
        number: note.number,
        issuedAt: note.createdAt,
        currency: invoice.currency,
        netTotal: Number(invoice.netTotal),
        taxTotal: Number(invoice.taxTotal),
        total: Number(invoice.total),
        buyer: {
          name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
          documentId: invoice.patient.documentId,
        },
        relatedFolio: invoice.fiscalFolio,
      });
      await this.prisma.db.creditNote.update({
        where: { id: creditNoteId },
        data: {
          fiscalStatus: 'AUTHORIZED',
          fiscalFolio: authorization.folio,
          fiscalAuthCode: authorization.authorizationCode,
          fiscalStampedAt: authorization.stampedAt,
        },
      });
    } catch (error) {
      this.logger.warn(`Nota de crédito ${creditNoteId} sin autorización fiscal: ${(error as Error).message}`);
    }
  }
}
