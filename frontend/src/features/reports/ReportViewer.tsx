import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../components/ui/Feedback';
import { Field, SelectField } from '../../components/ui/Field';
import { api, apiBlob } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { buildQuery } from '../../lib/usePagedList';
import { errorMessage, useResource } from '../../lib/useResource';
import { useToast } from '../../components/ui/Toast';
import { useOffices, useProfessionals } from '../catalog/useCatalog';
import { formatCell, GROUP_LABELS, type ReportData } from './types';

export interface Filters {
  from: string;
  to: string;
  officeId: string;
  professionalId: string;
  groupBy: string;
}

/** Visor genérico: filtros, tabla con totales y exportación a PDF o CSV (cada exportación queda auditada). */
export function ReportViewer({ reportKey, currency, filters, onFilters }: { reportKey: string; currency: string; filters: Filters; onFilters: (f: Filters) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const dentist = user?.role === 'ODONTOLOGO';
  const offices = useOffices();
  const professionals = useProfessionals();
  const [exporting, setExporting] = useState<string | null>(null);

  const query = buildQuery({ from: filters.from, to: filters.to, officeId: filters.officeId, professionalId: filters.professionalId, groupBy: reportKey === 'revenue' ? filters.groupBy : '' });
  const { data, error, loading } = useResource(useCallback(() => api<ReportData>(`/reports/${reportKey}${query}`), [reportKey, query]));

  const download = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    try {
      const blob = await apiBlob(`/reports/${reportKey}/export${query}${query ? '&' : '?'}format=${format}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportKey}-${filters.to}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.push('success', `Reporte exportado (${format.toUpperCase()}). La exportación quedó registrada en la auditoría.`);
    } catch (e) {
      toast.push('error', errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card
      flush
      title={data?.title ?? 'Reporte'}
      description={data?.subtitle}
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" loading={exporting === 'pdf'} onClick={() => void download('pdf')}>Exportar PDF</Button>
          <Button variant="secondary" size="sm" loading={exporting === 'csv'} onClick={() => void download('csv')}>Exportar CSV</Button>
        </div>
      }
    >
      <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" onSubmit={(event) => event.preventDefault()}>
        <div className="w-40"><Field label="Desde" type="date" value={filters.from} onChange={(e) => onFilters({ ...filters, from: e.target.value })} /></div>
        <div className="w-40"><Field label="Hasta" type="date" value={filters.to} onChange={(e) => onFilters({ ...filters, to: e.target.value })} /></div>
        <div className="w-52"><SelectField label="Consultorio" value={filters.officeId} onChange={(e) => onFilters({ ...filters, officeId: e.target.value })}><option value="">Todos</option>{offices.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectField></div>
        {!dentist && <div className="w-56"><SelectField label="Profesional" value={filters.professionalId} onChange={(e) => onFilters({ ...filters, professionalId: e.target.value })}><option value="">Todos</option>{professionals.data?.map((p) => <option key={p.id} value={p.id}>{p.user.fullName}</option>)}</SelectField></div>}
        {reportKey === 'revenue' && <div className="w-44"><SelectField label="Agrupar por" value={filters.groupBy} onChange={(e) => onFilters({ ...filters, groupBy: e.target.value })}>{Object.entries(GROUP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></div>}
      </form>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data && <Spinner />}
      {data && data.rows.length === 0 && <EmptyState icon="chart" title="Sin datos en el período" description="Cambie las fechas o los filtros." />}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">{data.title}</caption>
            <thead>
              <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-slate-500">
                {data.columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 ${c.type === 'text' || c.type === 'date' ? '' : 'text-right'}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((row, index) => (
                <tr key={index}>
                  {data.columns.map((c) => <td key={c.key} className={`px-4 py-2.5 ${c.type === 'text' || c.type === 'date' ? '' : 'text-right tabular-nums'}`}>{formatCell(row[c.key], c.type, currency)}</td>)}
                </tr>
              ))}
            </tbody>
            {data.totals && (
              <tfoot>
                <tr className="border-t-2 border-line bg-slate-50 font-semibold">
                  {data.columns.map((c) => <td key={c.key} className={`px-4 py-2.5 ${c.type === 'text' || c.type === 'date' ? '' : 'text-right tabular-nums'}`}>{formatCell(data.totals![c.key], c.type, currency)}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}
