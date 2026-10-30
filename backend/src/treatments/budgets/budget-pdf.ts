import { formatLocalDateTime } from '../../common/local-time';
import { pdfHeader, renderPdf } from '../../common/pdf';
import type { SigningEvidence } from '../../signing/signing.types';

export interface BudgetPdfLine {
  description: string;
  fee: number;
  labCost: number;
  approved: boolean;
}

export interface BudgetPdfPhase {
  name: string;
  total: number;
  lines: BudgetPdfLine[];
}

export interface BudgetPdfData {
  clinicName: string;
  timezone: string;
  currency: string;
  patientName: string;
  planTitle: string;
  version: number;
  phases: BudgetPdfPhase[];
  subtotalFees: number;
  subtotalLab: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  /** Presente cuando el documento corresponde a una aprobación (total o parcial). */
  approval?: { approvedTotal: number; partial: boolean; evidence?: SigningEvidence };
}

const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;

/** PDF del presupuesto. Con aprobación, marca los ítems aprobados e incluye la evidencia de la firma. */
export function renderBudgetPdf(data: BudgetPdfData): Promise<Buffer> {
  const c = data.currency;
  return renderPdf((doc) => {
    pdfHeader(doc, data.clinicName, `Presupuesto — ${data.planTitle} (versión ${data.version})`);
    doc.text(`Paciente: ${data.patientName}`);

    for (const phase of data.phases) {
      doc.moveDown().fontSize(11).text(phase.name, { underline: true }).fontSize(10);
      for (const line of phase.lines) {
        const mark = data.approval ? (line.approved ? '[✓] ' : '[ ] ') : '';
        doc.text(
          `${mark}${line.description} — honorarios ${money(line.fee, c)}` +
            (line.labCost > 0 ? ` + laboratorio ${money(line.labCost, c)}` : ''),
        );
      }
      doc.text(`Total de la fase: ${money(phase.total, c)}`, { align: 'right' });
    }

    doc.moveDown().fontSize(11).text('Resumen', { underline: true }).fontSize(10);
    doc.text(`Honorarios: ${money(data.subtotalFees, c)}`).text(`Laboratorio: ${money(data.subtotalLab, c)}`);
    if (data.discountPercent > 0) {
      doc.text(`Descuento autorizado (${data.discountPercent}% sobre honorarios): -${money(data.discountAmount, c)}`);
    }
    doc.fontSize(12).text(`Total del presupuesto: ${money(data.total, c)}`);

    if (!data.approval) return;
    doc.moveDown().fontSize(11).text(data.approval.partial ? 'Aprobación PARCIAL' : 'Aprobación TOTAL', { underline: true }).fontSize(10);
    doc.text(`Importe aprobado: ${money(data.approval.approvedTotal, c)}`);
    const { evidence } = data.approval;
    if (!evidence) {
      doc.fillColor('#b45309').text('PENDIENTE DE FIRMA').fillColor('#000');
      return;
    }
    doc.text(`Aprobado por: ${evidence.signerName} (${evidence.signerRelation === 'TUTOR' ? 'tutor legal' : 'paciente'})`);
    doc.text(`Fecha y hora: ${formatLocalDateTime(evidence.signedAt, data.timezone)}`);
    if (evidence.signatureImage) {
      doc.text('Firma manuscrita:');
      doc.image(evidence.signatureImage, { fit: [220, 90] });
    } else {
      doc.text(`Firma electrónica con código de un solo uso enviado a ${evidence.otpSentTo ?? 'el contacto registrado'}.`);
    }
    doc.moveDown().fontSize(8).fillColor('#6b7280').text(`Huella de integridad (SHA-256): ${evidence.evidenceHash}`);
  });
}
