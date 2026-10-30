import { useCallback, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { InlineError, Spinner } from '../../components/ui/Feedback';
import { PageHeader } from '../../components/ui/PageHeader';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { buildQuery } from '../../lib/usePagedList';
import { useResource } from '../../lib/useResource';
import { useSettings } from '../catalog/SettingsProvider';
import { DashboardPanel } from './DashboardPanel';
import { ReportViewer, type Filters } from './ReportViewer';
import type { Dashboard, ReportInfo } from './types';

const iso = (date: Date) => date.toLocaleDateString('en-CA');
const DEFAULT_FILTERS: Filters = { from: iso(new Date(Date.now() - 30 * 86_400_000)), to: iso(new Date()), officeId: '', professionalId: '', groupBy: 'professional' };

/** Panel de indicadores (administración y contabilidad) y reportes BI con filtros y exportación. */
export function ReportsPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const finance = user?.role !== 'ODONTOLOGO';
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string>(finance ? 'dashboard' : 'revenue');

  const catalog = useResource(useCallback(() => api<ReportInfo[]>('/reports'), []));
  const dashboardQuery = buildQuery({ from: filters.from, to: filters.to, officeId: filters.officeId, professionalId: filters.professionalId });
  const dashboard = useResource(useCallback(() => (finance && selected === 'dashboard' ? api<Dashboard>(`/reports/dashboard${dashboardQuery}`) : Promise.resolve(null)), [finance, selected, dashboardQuery]));

  const options = [...(finance ? [{ key: 'dashboard', title: 'Panel de indicadores', description: 'KPIs y gráficos del período.' }] : []), ...(catalog.data ?? [])];

  return (
    <>
      <PageHeader title="Reportes" description={finance ? 'Panel de indicadores y reportes de gestión, exportables a PDF y CSV.' : 'Sus propios indicadores: ingresos, agenda y procedimientos.'} />
      {catalog.error && <InlineError>{catalog.error}</InlineError>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Reportes disponibles">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {catalog.loading && !catalog.data && <li><Spinner /></li>}
            {options.map((r) => (
              <li key={r.key} className="shrink-0">
                <button type="button" aria-current={selected === r.key ? 'page' : undefined} onClick={() => setSelected(r.key)} className={`min-h-11 w-full rounded-xl border px-4 py-2 text-left text-sm transition ${selected === r.key ? 'border-brand-300 bg-brand-50 font-medium text-brand-900' : 'border-line bg-white text-slate-700 hover:bg-slate-50'}`}>
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {selected === 'dashboard' ? (
            <Card title="Panel de indicadores" description={`Del ${filters.from} al ${filters.to}`}>
              <div className="mb-4 flex flex-wrap gap-3">
                <label className="text-sm text-slate-600">Desde <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="ml-1 min-h-10 rounded-lg border border-line px-2" /></label>
                <label className="text-sm text-slate-600">Hasta <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="ml-1 min-h-10 rounded-lg border border-line px-2" /></label>
              </div>
              {dashboard.error && <InlineError>{dashboard.error}</InlineError>}
              {dashboard.loading && !dashboard.data && <Spinner />}
              {dashboard.data && <DashboardPanel data={dashboard.data} />}
            </Card>
          ) : (
            <ReportViewer key={selected} reportKey={selected} currency={settings.currency} filters={filters} onFilters={setFilters} />
          )}
        </div>
      </div>
    </>
  );
}
