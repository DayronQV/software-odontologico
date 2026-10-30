import { formatLocalDateTime } from '../common/local-time';
import { pdfHeader, renderPdf } from '../common/pdf';
import type { ReportColumn, ReportResult } from './report.types';

function formatCell(value: string | number | null | undefined, column: ReportColumn, timezone: string, currency: string): string {
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'date' && typeof value === 'string' && value.includes('T')) return formatLocalDateTime(new Date(value), timezone);
  if (column.type === 'money') return `${Number(value).toFixed(2)} ${currency}`;
  if (column.type === 'percent') return `${value} %`;
  return String(value);
}

/** Neutraliza fórmulas de hoja de cálculo (=, +, -, @) para que un dato no se ejecute al abrir el CSV. */
const safeCsv = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const BOM = '﻿';
const EOL = '\r\n';

/** CSV con BOM (Excel lo abre con tildes) y comillas correctas. Las cifras van sin formato. */
export function toCsv(report: ReportResult): string {
  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const lines = [report.columns.map((c) => escape(c.label)).join(',')];
  const add = (row: Record<string, string | number | null>) =>
    lines.push(report.columns.map((c) => (typeof row[c.key] === 'number' ? String(row[c.key]) : escape(safeCsv(String(row[c.key] ?? ''))))).join(','));
  report.rows.forEach(add);
  if (report.totals) add(report.totals);
  return BOM + lines.join(EOL) + EOL;
}

/** PDF apaisado con la tabla del reporte. */
export function toPdf(report: ReportResult, clinicName: string, timezone: string, currency: string): Promise<Buffer> {
  return renderPdf(
    (doc) => {
      pdfHeader(doc, clinicName, report.title);
      doc.fontSize(9).fillColor('#475569').text(report.subtitle).fillColor('#000').moveDown(0.6);
      const width = (doc.page.width - 96) / report.columns.length;
      const drawRow = (cells: string[], bold = false) => {
        if (doc.y > doc.page.height - 70) doc.addPage();
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        cells.forEach((cell, i) => doc.text(cell, 48 + i * width, y, { width: width - 4, ellipsis: true, lineBreak: false }));
        doc.y = y + 14;
      };
      drawRow(report.columns.map((c) => c.label), true);
      doc.moveTo(48, doc.y - 2).lineTo(doc.page.width - 48, doc.y - 2).strokeColor('#cbd5e1').stroke();
      for (const row of report.rows) drawRow(report.columns.map((c) => formatCell(row[c.key], c, timezone, currency)));
      if (report.totals) drawRow(report.columns.map((c) => formatCell(report.totals![c.key], c, timezone, currency)), true);
      if (report.rows.length === 0) doc.moveDown().text('Sin datos en el período.');
    },
    { landscape: true },
  );
}
