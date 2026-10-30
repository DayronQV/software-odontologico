import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchInput } from '../../../components/ui/SearchInput';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useAuth } from '../../../lib/auth';
import { initials } from '../../../lib/format';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePagedList } from '../../../lib/usePagedList';
import type { PatientListItem } from '../types';

export function PatientsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('true');
  const q = useDebouncedValue(search);
  const { data, error, loading, page, setPage, pageSize } = usePagedList<PatientListItem>('/patients', {
    pageSize: 12,
    filters: { q, active: status === '' ? undefined : status },
  });

  const columns: Column<PatientListItem>[] = [
    {
      header: 'Paciente',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
            {initials(p.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{p.fullName}</p>
            <p className="text-xs text-slate-500">
              {p.age} años{p.isMinor ? ' · menor de edad' : ''} {p.documentMasked ? `· ${p.documentMasked}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    { header: 'Teléfono', hideOnSmall: true, cell: (p) => p.phone ?? <span className="text-slate-400">—</span> },
    {
      header: 'Alertas',
      cell: (p) => (
        <div className="flex flex-wrap gap-1.5">
          {p.criticalAlerts.map((a) => (
            <span key={a.ruleId} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">
              <Icon name="alert" className="h-3 w-3" /> {a.label}
            </span>
          ))}
          {!p.hasMedicalHistory && <Badge tone="warning">Anamnesis pendiente</Badge>}
          {!p.active && <Badge tone="neutral">Inactivo</Badge>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Fichas únicas con anamnesis y alertas médicas."
        actions={
          user?.role === 'RECEPCIONISTA' ? (
            <Button onClick={() => navigate('/patients/new')}>
              <Icon name="plus" className="h-4 w-4" /> Nuevo paciente
            </Button>
          ) : undefined
        }
      />
      <Card flush>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_180px]">
          <SearchInput label="Buscar pacientes" placeholder="Buscar por nombre, apellido o documento exacto" value={search} onChange={setSearch} />
          <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
            <option value="">Todos</option>
          </SelectField>
        </div>
        {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
        {loading && !data ? (
          <Spinner />
        ) : data?.items.length === 0 ? (
          <EmptyState
            icon="users"
            title={q ? 'No se encontraron pacientes' : 'Aún no hay pacientes'}
            description={q ? 'Revise la ortografía o busque por el documento exacto.' : 'Registre al primer paciente para comenzar.'}
          />
        ) : (
          <DataTable columns={columns} rows={data?.items ?? []} getKey={(p) => p.id} caption="Pacientes" onRowClick={(p) => navigate(`/patients/${p.id}`)} />
        )}
        {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      </Card>
    </>
  );
}
