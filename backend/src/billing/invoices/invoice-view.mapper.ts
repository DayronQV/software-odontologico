import type { Prisma } from '@prisma/client';
import { formatCreditNoteNumber, formatInvoiceNumber } from '../domain/document-number';

export const INVOICE_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
  lines: { orderBy: { description: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  retentions: true,
  creditNote: true,
  issuedBy: { select: { fullName: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

/** Comprobante completo (detalle, PDF y respuesta al emitir). */
export function toInvoiceView(invoice: InvoiceWithRelations) {
  return {
    id: invoice.id,
    number: invoice.number,
    displayNumber: formatInvoiceNumber(invoice.number),
    status: invoice.status,
    createdAt: invoice.createdAt,
    issuedBy: invoice.issuedBy.fullName,
    patient: {
      id: invoice.patient.id,
      fullName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      documentId: invoice.patient.documentId,
    },
    appointmentId: invoice.appointmentId,
    currency: invoice.currency,
    taxRatePercent: invoice.taxRatePercent,
    grossTotal: invoice.grossTotal,
    discountTotal: invoice.discountTotal,
    netTotal: invoice.netTotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    retentionTotal: invoice.retentionTotal,
    payableTotal: invoice.payableTotal,
    notes: invoice.notes,
    lines: invoice.lines.map((l) => ({
      id: l.id,
      procedureId: l.procedureId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      discountAmount: l.discountAmount,
      netAmount: l.netAmount,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      authCode: p.gatewayAuthCode,
    })),
    retentions: invoice.retentions.map((r) => ({
      type: r.type,
      percent: r.percent,
      amount: r.amount,
    })),
    fiscal: {
      status: invoice.fiscalStatus,
      provider: invoice.fiscalProvider,
      folio: invoice.fiscalFolio,
      authorizationCode: invoice.fiscalAuthCode,
      stampedAt: invoice.fiscalStampedAt,
      error: invoice.fiscalError,
    },
    void: invoice.voidedAt
      ? {
          voidedAt: invoice.voidedAt,
          reason: invoice.voidReason,
          creditNote: invoice.creditNote && {
            number: invoice.creditNote.number,
            displayNumber: formatCreditNoteNumber(invoice.creditNote.number),
            total: invoice.creditNote.total,
            fiscalFolio: invoice.creditNote.fiscalFolio,
            fiscalAuthCode: invoice.creditNote.fiscalAuthCode,
          },
        }
      : null,
  };
}

export type InvoiceView = ReturnType<typeof toInvoiceView>;

/** Fila del listado. */
export function toInvoiceListItem(
  invoice: Prisma.InvoiceGetPayload<{
    include: { patient: { select: { firstName: true; lastName: true } }; payments: true };
  }>,
) {
  return {
    id: invoice.id,
    number: invoice.number,
    displayNumber: formatInvoiceNumber(invoice.number),
    status: invoice.status,
    createdAt: invoice.createdAt,
    patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
    currency: invoice.currency,
    total: invoice.total,
    payableTotal: invoice.payableTotal,
    fiscalStatus: invoice.fiscalStatus,
    methods: [...new Set(invoice.payments.map((p) => p.method))],
  };
}
