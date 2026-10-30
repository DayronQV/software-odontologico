import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchInput } from '../../../components/ui/SearchInput';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePagedList } from '../../../lib/usePagedList';
import { errorMessage } from '../../../lib/useResource';
import type { Chair, Office } from '../../catalog/types';
import { ChairFormModal } from './ChairFormModal';
import { OfficeFormModal } from './OfficeFormModal';

export function OfficesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, error, loading, page, setPage, pageSize, reload } = usePagedList<Office>('/catalog/offices', {
    pageSize: 10,
    filters: { q },
  });

  const [officeModal, setOfficeModal] = useState<{ office: Office | null } | null>(null);
  const [chairModal, setChairModal] = useState<{ officeId: string; chair: Chair | null } | null>(null);

  const setActive = async (path: string, active: boolean, label: string) => {
    try {
      await api(path, { method: 'PATCH', body: { active } });
      toast.push('success', active ? `${label} activado` : `${label} desactivado`);
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput label="Buscar consultorios" placeholder="Buscar consultorio" value={search} onChange={setSearch} className="w-full max-w-sm" />
        <Button onClick={() => setOfficeModal({ office: null })}>
          <Icon name="plus" className="h-4 w-4" /> Nuevo consultorio
        </Button>
      </div>

      {error && <InlineError>{error}</InlineError>}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length === 0 ? (
        <Card><EmptyState icon="building" title="Sin consultorios" description="Cree el primer consultorio y agregue sus sillones." /></Card>
      ) : (
        data?.items.map((office) => (
          <Card
            key={office.id}
            title={office.name}
            description={office.address ?? 'Sin dirección'}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={office.active ? 'success' : 'neutral'}>{office.active ? 'Activo' : 'Inactivo'}</Badge>
                <Button variant="secondary" size="sm" onClick={() => setOfficeModal({ office })}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => void setActive(`/catalog/offices/${office.id}`, !office.active, 'Consultorio')}>
                  {office.active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {office.chairs.length === 0 && <p className="text-sm text-slate-500">Aún no tiene sillones.</p>}
              {office.chairs.map((chair) => (
                <div
                  key={chair.id}
                  className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm ${chair.active ? 'border-line bg-slate-50 text-slate-800' : 'border-dashed border-line text-slate-400'}`}
                >
                  <span className="font-medium">{chair.name}</span>
                  <button type="button" className="ml-1 text-xs text-brand-700 hover:underline" onClick={() => setChairModal({ officeId: office.id, chair })}>
                    renombrar
                  </button>
                  <button type="button" className="ml-1 text-xs text-slate-500 hover:underline" onClick={() => void setActive(`/catalog/chairs/${chair.id}`, !chair.active, 'Sillón')}>
                    {chair.active ? 'desactivar' : 'activar'}
                  </button>
                </div>
              ))}
              {office.active && (
                <Button variant="ghost" size="sm" onClick={() => setChairModal({ officeId: office.id, chair: null })}>
                  <Icon name="plus" className="h-4 w-4" /> Agregar sillón
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
      {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}

      <OfficeFormModal state={officeModal} onClose={() => setOfficeModal(null)} onSaved={() => void reload()} />
      <ChairFormModal state={chairModal} onClose={() => setChairModal(null)} onSaved={() => void reload()} />
    </div>
  );
}
