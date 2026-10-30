import { renderPdf, pdfHeader } from '../../common/pdf';
import { formatLocalDateTime } from '../../common/local-time';
import type { SigningEvidence } from '../../signing/signing.types';

export interface ConsentPdfData {
  clinicName: string;
  timezone: string;
  title: string;
  version: number;
  text: string;
  patientName: string;
  professionalName: string;
  /** Sin evidencia = vista previa para leer antes de firmar. */
  evidence?: SigningEvidence;
}

/** PDF del consentimiento informado. Firmado: incluye el trazo u OTP, fecha y huella de integridad. */
export function renderConsentPdf(data: ConsentPdfData): Promise<Buffer> {
  return renderPdf((doc) => {
    pdfHeader(doc, data.clinicName, `${data.title} (versión ${data.version})`);
    doc.text(`Paciente: ${data.patientName}`).text(`Profesional responsable: ${data.professionalName}`);
    doc.moveDown().fontSize(11).text(data.text, { align: 'justify', lineGap: 3 });

    doc.moveDown(2).fontSize(10);
    const { evidence } = data;
    if (!evidence) {
      doc.fillColor('#b45309').text('DOCUMENTO SIN FIRMAR — vista previa').fillColor('#000');
      return;
    }
    doc.text(
      `Firmado por: ${evidence.signerName} (${evidence.signerRelation === 'TUTOR' ? 'tutor legal' : 'paciente'})`,
    );
    doc.text(`Fecha y hora: ${formatLocalDateTime(evidence.signedAt, data.timezone)}`);
    if (evidence.signatureImage) {
      doc.text('Firma manuscrita en pantalla táctil:');
      doc.image(evidence.signatureImage, { fit: [220, 90] });
    } else {
      doc.text(`Firma electrónica con código de un solo uso enviado a ${evidence.otpSentTo ?? 'el contacto registrado'}.`);
    }
    doc.moveDown().fontSize(8).fillColor('#6b7280');
    doc.text(`Huella de integridad (SHA-256): ${evidence.evidenceHash}`);
    if (evidence.ip) doc.text(`Dirección IP de la firma: ${evidence.ip}`);
  });
}
