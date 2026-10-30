import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchInput } from '../../../components/ui/SearchInput';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePagedList } from '../../../lib/usePagedList';
import { errorMessage } from '../../../lib/useResource';
import type { Professional } from '../../catalog/types';
import { ProfessionalFormModal } from './ProfessionalFormModal';
import { ScheduleEditorModal } from './ScheduleEditorModal';
import { summarizeSchedule } from './schedule-utils';

export function ProfessionalsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, error, loading, page, setPage, pageSize, reload } = usePagedList<Professional>('/catalog/professionals', {
    pageSize: 10,
    filters: { q },
  });
  const [form, setForm] = useState<{ professional: Professional | null } | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Professional | null>(null);

  const toggleActive = async (p: Professional) => {
    try {
      await api(`/catalog/professionals/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
      toast.push('success', p.active ? 'Profesional desactivado' : 'Profesional activado');
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const columns: Column<Professional>[] = [
    {
      header: 'Profesional',
      cell: (p) => (
        <div>
          <p className="font-medium text-slate-900">{p.user.fullName}</p>
          <p className="text-xs text-slate-500">{p.user.email}</p>
        </div>
      ),
    },
    {
      header: 'Especialidad',
      hideOnSmall: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <span>{p.specialty ?? '—'}</span>
          {p.kind === 'SPECIALIST' && <Badge tone="violet">Especialista</Badge>}
        </div>
      ),
    },
    { header: 'Horario', hideOnSmall: true, cell: (p) => <span className="text-xs text-slate-600">{summarizeSchedule(p.schedules)}</span> },
    { header: 'Estado', cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Activo' : 'Inactivo'}</Badge> },
    {
      header: 'Acciones',
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setScheduleFor(p)}>Horario</Button>
          <Button variant="secondary" size="sm" onClick={() => setForm({ professional: p })}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(p)}>{p.active ? 'Desactivar' : 'Activar'}</Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      flush
      title="Profesionales"
      description="Odontólogos que atienden en la clínica y su horario laboral."
      action={<Button onClick={() => setForm({ professional: null })}><Icon name="plus" className="h-4 w-4" /> Nuevo profesional</Button>}
    >
      <div className="border-b border-line p-4">
        <SearchInput label="Buscar profesionales" placeholder="Buscar por nombre o especialidad" value={search} onChange={setSearch} className="max-w-sm" />
      </div>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length === 0 ? (
        <EmptyState icon="users" title="Sin profesionales" description="Registre a un usuario odontólogo para poder agendar citas." />
      ) : (
        <DataTable columns={columns} rows={data?.items ?? []} getKey={(p) => p.id} caption="Profesionales" />
      )}
      {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}

      <ProfessionalFormModal state={form} takenUserIds={(data?.items ?? []).map((p) => p.userId)} onClose={() => setForm(null)} onSaved={() => void reload()} />
      <ScheduleEditorModal professional={scheduleFor} onClose={() => setScheduleFor(null)} onSaved={() => void reload()} />
    </Card>
  );
}
