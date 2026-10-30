import PDFDocument from 'pdfkit';

/** Dibuja un PDF A4 con `draw` y devuelve sus bytes. */
export function renderPdf(draw: (doc: PDFKit.PDFDocument) => void, options: { landscape?: boolean } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, layout: options.landscape ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Encabezado común de los documentos de la clínica. */
export function pdfHeader(doc: PDFKit.PDFDocument, clinicName: string, title: string): void {
  doc.fontSize(18).fillColor('#0f766e').text(clinicName, { align: 'left' });
  doc.moveDown(0.2).fontSize(13).fillColor('#111827').text(title);
  doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor('#d1d5db').stroke();
  doc.moveDown(0.8).fillColor('#000').fontSize(10);
}
