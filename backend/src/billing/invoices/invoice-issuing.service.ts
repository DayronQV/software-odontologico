import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { fromCents, toCents } from '../../common/money';
import type { AuthUser } from '../../common/types';
import {
  FISCAL_INVOICE_PROVIDER,
  type FiscalInvoiceProvider,
} from '../../integrations/fiscal/fiscal-invoice-provider';
import {
  PAYMENT_GATEWAY,
  PaymentDeclinedError,
  type ChargeResult,
  type PaymentGateway,
} from '../../integrations/payments/payment-gateway';
import { CommissionsService } from '../../commissions/commissions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CashSessionsService } from '../cash/cash-sessions.service';
import { calculateInvoice } from '../domain/invoice-calculator';
import { CARD_METHODS, validatePayments } from '../domain/payments-validator';
import type { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { InvoicesQueryService } from './invoices-query.service';

interface ResolvedLine {
  procedureId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
}

/**
 * Emisión de comprobantes (RF-12): líneas desde el catálogo o libres, descuentos con tope,
 * impuestos, retenciones, pagos mixtos exactos, cobro con tarjeta por la pasarela y
 * autorización fiscal electrónica (simulada).
 */
@Injectable()
export class InvoiceIssuingService {
  private readonly logger = new Logger(InvoiceIssuingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cash: CashSessionsService,
    private readonly query: InvoicesQueryService,
    private readonly commissions: CommissionsService,
    @Inject(FISCAL_INVOICE_PROVIDER) private readonly fiscal: FiscalInvoiceProvider,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async issue(dto: IssueInvoiceDto, user: AuthUser) {
    const session = await this.cash.requireOpen(user.id);
    const clinic = await this.settings.get();
    const patient = await this.prisma.db.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient || !patient.active) throw new NotFoundException('Paciente no encontrado');
    if (dto.appointmentId) await this.assertAppointment(dto.appointmentId, dto.patientId);

    const lines = await this.resolveLines(dto, user, Number(clinic.maxDiscountPercent));
    const totals = calculateInvoice(
      lines,
      Number(clinic.taxRatePercent),
      (dto.retentions ?? []).map((r) => ({ type: r.type, percent: r.percent })),
    );

    const paymentError = validatePayments(
      dto.payments.map((p) => ({
        method: p.method,
        amountCents: toCents(p.amount),
        reference: p.reference,
      })),
      totals.payableCents,
    );
    if (paymentError) throw new BadRequestException(paymentError);

    const charges = await this.chargeCards(dto, clinic.currency);

    let invoiceId: string;
    try {
      invoiceId = await this.prisma.db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            patientId: patient.id,
            appointmentId: dto.appointmentId,
            issuedById: user.id,
            cashSessionId: session.id,
            currency: clinic.currency,
            taxRatePercent: clinic.taxRatePercent,
            grossTotal: fromCents(totals.grossCents),
            discountTotal: fromCents(totals.discountCents),
            netTotal: fromCents(totals.netCents),
            taxTotal: fromCents(totals.taxCents),
            total: fromCents(totals.totalCents),
            retentionTotal: fromCents(totals.retentionCents),
            payableTotal: fromCents(totals.payableCents),
            notes: dto.notes?.trim(),
            lines: {
              create: lines.map((line, i) => ({
                procedureId: line.procedureId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: fromCents(line.unitPriceCents),
                discountPercent: line.discountPercent,
                discountAmount: fromCents(totals.lines[i].discountCents),
                netAmount: fromCents(totals.lines[i].netCents),
                taxAmount: fromCents(totals.lines[i].taxCents),
                lineTotal: fromCents(totals.lines[i].totalCents),
              })),
            },
            payments: {
              create: dto.payments.map((p, i) => ({
                cashSessionId: session.id,
                method: p.method,
                amount: p.amount,
                reference: p.reference?.trim(),
                gatewayTransactionId: charges[i]?.transactionId,
                gatewayAuthCode: charges[i]?.authCode,
              })),
            },
            retentions: {
              create: totals.retentions.map((r) => ({
                type: r.type,
                percent: r.percent,
                amount: fromCents(r.amountCents),
              })),
            },
          },
        });
        // RF-13: la comisión del profesional se devenga en la misma transacción que el cobro
        await this.commissions.accrueForInvoice(tx, invoice.id);
        return invoice.id;
      });
    } catch (error) {
      await this.reverseCharges(charges);
      throw error;
    }

    await this.authorizeFiscal(invoiceId);
    return this.query.findOne(invoiceId);
  }

  /** Reintenta la autorización fiscal de un comprobante que quedó pendiente. */
  async retryFiscal(id: string) {
    const invoice = await this.prisma.db.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    await this.authorizeFiscal(id);
    return this.query.findOne(id);
  }

  // ----------------------------------------------------------------- pasos

  private async resolveLines(
    dto: IssueInvoiceDto,
    user: AuthUser,
    maxDiscountPercent: number,
  ): Promise<ResolvedLine[]> {
    const ids = dto.lines.map((l) => l.procedureId).filter((id): id is string => !!id);
    const procedures = await this.prisma.db.procedure.findMany({
      where: { id: { in: ids }, active: true },
    });
    const byId = new Map(procedures.map((p) => [p.id, p]));

    return dto.lines.map((line) => {
      const procedure = line.procedureId ? byId.get(line.procedureId) : undefined;
      if (line.procedureId && !procedure) {
        throw new BadRequestException('Algún procedimiento no existe o está desactivado');
      }
      if (procedure && line.unitPrice !== undefined) {
        const changed = toCents(line.unitPrice) !== toCents(Number(procedure.basePrice));
        if (changed && user.role !== Role.ADMIN_TI) {
          throw new ForbiddenException('Solo el administrador puede modificar el precio del catálogo');
        }
      }
      const unitPrice = line.unitPrice ?? (procedure ? Number(procedure.basePrice) : undefined);
      if (unitPrice === undefined) {
        throw new BadRequestException('Las líneas libres requieren un precio unitario');
      }
      const discountPercent = line.discountPercent ?? 0;
      if (discountPercent > maxDiscountPercent && user.role !== Role.ADMIN_TI) {
        throw new ForbiddenException(
          `Descuento superior al autorizado (${maxDiscountPercent}%): requiere la autorización del administrador`,
        );
      }
      return {
        procedureId: procedure?.id ?? null,
        description: line.description?.trim() || procedure!.name,
        quantity: line.quantity,
        unitPriceCents: toCents(unitPrice),
        discountPercent,
      };
    });
  }

  private async assertAppointment(appointmentId: string, patientId: string): Promise<void> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
      select: { patientId: true },
    });
    if (!appointment || appointment.patientId !== patientId) {
      throw new BadRequestException('La cita no corresponde a este paciente');
    }
  }

  /** Cobra los pagos con tarjeta; si uno falla, revierte los que ya se aprobaron. */
  private async chargeCards(dto: IssueInvoiceDto, currency: string): Promise<(ChargeResult | undefined)[]> {
    const results: (ChargeResult | undefined)[] = [];
    try {
      for (const payment of dto.payments) {
        if (!CARD_METHODS.includes(payment.method)) {
          results.push(undefined);
          continue;
        }
        results.push(
          await this.gateway.charge({
            amount: payment.amount,
            currency,
            method: payment.method as 'CARD_CREDIT' | 'CARD_DEBIT',
            cardToken: payment.cardToken,
            reference: `patient-${dto.patientId}`,
          }),
        );
      }
      return results;
    } catch (error) {
      await this.reverseCharges(results);
      if (error instanceof PaymentDeclinedError) {
        throw new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED);
      }
      this.logger.error(`Fallo de la pasarela: ${(error as Error).message}`);
      throw new BadGatewayException('No se pudo procesar el pago con tarjeta. Intente nuevamente.');
    }
  }

  private async reverseCharges(charges: (ChargeResult | undefined)[]): Promise<void> {
    for (const charge of charges) {
      if (!charge) continue;
      try {
        await this.gateway.reverse(charge.transactionId);
      } catch (error) {
        this.logger.error(`No se pudo revertir ${charge.transactionId}: ${(error as Error).message}`);
      }
    }
  }

  /** Autoriza el comprobante ante el proveedor fiscal; si falla queda PENDIENTE y se puede reintentar. */
  private async authorizeFiscal(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { patient: { select: { firstName: true, lastName: true, documentId: true } } },
    });
    try {
      const authorization = await this.fiscal.authorize({
        kind: 'INVOICE',
        number: invoice.number,
        issuedAt: invoice.createdAt,
        currency: invoice.currency,
        netTotal: Number(invoice.netTotal),
        taxTotal: Number(invoice.taxTotal),
        total: Number(invoice.total),
        buyer: {
          name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
          documentId: invoice.patient.documentId,
        },
      });
      await this.prisma.db.invoice.update({
        where: { id: invoiceId },
        data: {
          fiscalStatus: 'AUTHORIZED',
          fiscalProvider: authorization.provider,
          fiscalFolio: authorization.folio,
          fiscalAuthCode: authorization.authorizationCode,
          fiscalStampedAt: authorization.stampedAt,
          fiscalError: null,
        },
      });
    } catch (error) {
      this.logger.warn(`Autorización fiscal pendiente (${invoiceId}): ${(error as Error).message}`);
      await this.prisma.db.invoice.update({
        where: { id: invoiceId },
        data: { fiscalStatus: 'PENDING', fiscalError: (error as Error).message.slice(0, 300) },
      });
    }
  }
}
