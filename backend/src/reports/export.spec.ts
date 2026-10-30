import { toCsv, toPdf } from './export';
import type { ReportResult } from './report.types';

const report: ReportResult = {
  key: 'revenue',
  title: 'Ingresos',
  subtitle: 'Del 2026-11-01 al 2026-11-30',
  columns: [
    { key: 'label', label: 'Profesional', type: 'text' },
    { key: 'total', label: 'Total', type: 'money' },
  ],
  rows: [
    { label: 'Dr. "Andrés", Salazar', total: 1234.5 },
    { label: '=HYPERLINK("http://x")', total: 10 },
  ],
  totals: { label: 'Total', total: 1244.5 },
};

describe('exportación de reportes', () => {
  it('CSV con BOM, comillas escapadas y cifras sin formato', () => {
    const csv = toCsv(report);
    expect(csv.startsWith('﻿"Profesional","Total"')).toBe(true);
    expect(csv).toContain('"Dr. ""Andrés"", Salazar",1234.5');
    expect(csv.trim().split('\r\n')).toHaveLength(4);
  });

  it('neutraliza fórmulas de hoja de cálculo (inyección CSV)', () => {
    expect(toCsv(report)).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it('PDF válido, también sin filas', async () => {
    const pdf = await toPdf(report, 'Clínica SIGO', 'America/Bogota', 'USD');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const empty = await toPdf({ ...report, rows: [], totals: undefined }, 'Clínica SIGO', 'America/Bogota', 'USD');
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
