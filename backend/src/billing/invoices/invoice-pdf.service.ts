import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { SettingsService } from '../../catalog/settings/settings.service';
import { formatLocalDateTime } from '../../common/local-time';
import type { InvoiceView } from './invoice-view.mapper';
import { InvoicesQueryService } from './invoices-query.service';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD_CREDIT: 'Tarjeta de crédito',
  CARD_DEBIT: 'Tarjeta de débito',
  TRANSFER: 'Transferencia',
  INSURANCE: 'Seguro',
};

const money = (value: unknown, currency: string) => `${Number(value).toFixed(2)} ${currency}`;

/** Genera el PDF del comprobante electrónico. Es una representación simulada, sin validez fiscal. */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly query: InvoicesQueryService,
    private readonly settings: SettingsService,
  ) {}

  async render(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const [invoice, clinic] = await Promise.all([
      this.query.findOne(invoiceId),
      this.settings.get(),
    ]);
    const buffer = await this.draw(invoice, clinic.clinicName, clinic.timezone);
    return { buffer, filename: `${invoice.displayNumber}.pdf` };
  }

  private draw(invoice: InvoiceView, clinicName: string, timezone: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const c = invoice.currency;
      doc.fontSize(18).text(clinicName, { align: 'left' });
      doc.fontSize(9).fillColor('#666').text('COMPROBANTE ELECTRÓNICO — SIMULADO, SIN VALIDEZ FISCAL');
      doc.moveDown(0.5).fillColor('#000').fontSize(14).text(`Comprobante ${invoice.displayNumber}`);
      doc
        .fontSize(10)
        .text(`Fecha: ${formatLocalDateTime(invoice.createdAt, timezone)}`)
        .text(`Paciente: ${invoice.patient.fullName}`)
        .text(`Atendido por: ${invoice.issuedBy}`);
      if (invoice.fiscal.folio) {
        doc.text(`Folio fiscal: ${invoice.fiscal.folio}  ·  Autorización: ${invoice.fiscal.authorizationCode}`);
      } else {
        doc.fillColor('#b45309').text('Autorización fiscal pendiente').fillColor('#000');
      }
      if (invoice.void) {
        doc
          .moveDown(0.3)
          .fillColor('#b91c1c')
          .fontSize(12)
          .text(`ANULADO — ${invoice.void.reason}`)
          .fillColor('#000');
      }

      doc.moveDown().fontSize(11).text('Detalle', { underline: true });
      doc.fontSize(10);
      for (const line of invoice.lines) {
        doc.text(
          `${line.quantity} × ${line.description}  —  ${money(line.unitPrice, c)}` +
            (Number(line.discountPercent) > 0 ? `  (desc. ${line.discountPercent}%)` : '') +
            `  =  ${money(line.lineTotal, c)}`,
        );
      }

      doc.moveDown().fontSize(11).text('Totales', { underline: true });
      doc
        .fontSize(10)
        .text(`Subtotal: ${money(invoice.grossTotal, c)}`)
        .text(`Descuentos: ${money(invoice.discountTotal, c)}`)
        .text(`Base imponible: ${money(invoice.netTotal, c)}`)
        .text(`Impuestos (${invoice.taxRatePercent}%): ${money(invoice.taxTotal, c)}`)
        .text(`Total: ${money(invoice.total, c)}`);
      for (const retention of invoice.retentions) {
        doc.text(`Retención ${retention.type} (${retention.percent}%): -${money(retention.amount, c)}`);
      }
      doc.fontSize(12).text(`A cobrar: ${money(invoice.payableTotal, c)}`);

      doc.moveDown().fontSize(11).text('Pagos', { underline: true });
      doc.fontSize(10);
      for (const payment of invoice.payments) {
        doc.text(
          `${PAYMENT_LABELS[payment.method] ?? payment.method}: ${money(payment.amount, c)}` +
            (payment.reference ? `  (ref. ${payment.reference})` : ''),
        );
      }
      if (invoice.notes) doc.moveDown().text(`Notas: ${invoice.notes}`);
      doc.end();
    });
  }
}
