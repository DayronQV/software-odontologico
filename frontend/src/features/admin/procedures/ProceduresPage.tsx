import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchInput } from '../../../components/ui/SearchInput';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePagedList } from '../../../lib/usePagedList';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import type { Procedure } from '../../catalog/types';
import { ProcedureFormModal } from './ProcedureFormModal';

export function ProceduresPage() {
  const toast = useToast();
  const { settings } = useSettings();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebouncedValue(search);
  const { data, error, loading, page, setPage, pageSize, reload } = usePagedList<Procedure>('/catalog/procedures', {
    pageSize: 12,
    filters: { q, category, active: status === '' ? undefined : status },
  });
  const categoriesLoader = useCallback(() => api<string[]>('/catalog/procedures/categories'), []);
  const { data: categories, reload: reloadCategories } = useResource(categoriesLoader);
  const [form, setForm] = useState<{ procedure: Procedure | null } | null>(null);

  const toggleActive = async (p: Procedure) => {
    try {
      await api(`/catalog/procedures/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
      toast.push('success', p.active ? 'Procedimiento desactivado' : 'Procedimiento activado');
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const columns: Column<Procedure>[] = [
    { header: 'Código', cell: (p) => <span className="font-mono text-xs text-slate-600">{p.code}</span> },
    {
      header: 'Procedimiento',
      cell: (p) => (
        <div>
          <p className="font-medium text-slate-900">{p.name}</p>
          <p className="text-xs text-slate-500">{p.category} · {p.durationMinutes} min</p>
        </div>
      ),
    },
    { header: 'Precio', align: 'right', cell: (p) => <span className="font-medium text-slate-900">{formatMoney(p.basePrice, settings.currency)}</span> },
    { header: 'Laboratorio', align: 'right', hideOnSmall: true, cell: (p) => formatMoney(p.labCost, settings.currency) },
    { header: 'Consentimiento', hideOnSmall: true, cell: (p) => (p.requiresConsent ? <Badge tone="info">Requerido</Badge> : <span className="text-slate-400">—</span>) },
    { header: 'Estado', cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Activo' : 'Inactivo'}</Badge> },
    {
      header: 'Acciones',
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setForm({ procedure: p })}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(p)}>{p.active ? 'Desactivar' : 'Activar'}</Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      flush
      title="Catálogo de procedimientos"
      description="Precios, duración estándar y costo de laboratorio."
      action={<Button onClick={() => setForm({ procedure: null })}><Icon name="plus" className="h-4 w-4" /> Nuevo procedimiento</Button>}
    >
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_200px_160px]">
        <SearchInput label="Buscar procedimientos" placeholder="Buscar por código o nombre" value={search} onChange={setSearch} />
        <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas</option>
          {(categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </SelectField>
      </div>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length === 0 ? (
        <EmptyState icon="file" title="Sin procedimientos" description="Pruebe con otro filtro o cree un procedimiento nuevo." />
      ) : (
        <DataTable columns={columns} rows={data?.items ?? []} getKey={(p) => p.id} caption="Procedimientos" />
      )}
      {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      <ProcedureFormModal state={form} onClose={() => setForm(null)} onSaved={() => { void reload(); void reloadCategories(); }} />
    </Card>
  );
}
