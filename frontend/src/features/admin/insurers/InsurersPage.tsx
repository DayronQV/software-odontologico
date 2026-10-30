import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchInput } from '../../../components/ui/SearchInput';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { usePagedList } from '../../../lib/usePagedList';
import { errorMessage } from '../../../lib/useResource';
import type { Insurer } from '../../catalog/types';

const schema = z.object({ name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100) });
type Form = z.infer<typeof schema>;

function InsurerModal({ state, onClose, onSaved }: { state: { insurer: Insurer | null } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const insurer = state?.insurer ?? null;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (state) reset({ name: insurer?.name ?? '' });
  }, [state, insurer, reset]);

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      if (insurer) await api(`/catalog/insurers/${insurer.id}`, { method: 'PATCH', body: { name } });
      else await api('/catalog/insurers', { method: 'POST', body: { name } });
      toast.push('success', insurer ? 'Aseguradora actualizada' : 'Aseguradora creada');
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={!!state} title={insurer ? 'Editar aseguradora' : 'Nueva aseguradora o convenio'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre" error={errors.name?.message} {...register('name')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function InsurersPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, error, loading, page, setPage, pageSize, reload } = usePagedList<Insurer>('/catalog/insurers', { pageSize: 12, filters: { q } });
  const [form, setForm] = useState<{ insurer: Insurer | null } | null>(null);

  const toggleActive = async (i: Insurer) => {
    try {
      await api(`/catalog/insurers/${i.id}`, { method: 'PATCH', body: { active: !i.active } });
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const columns: Column<Insurer>[] = [
    { header: 'Aseguradora o convenio', cell: (i) => <span className="font-medium text-slate-900">{i.name}</span> },
    { header: 'Estado', cell: (i) => <Badge tone={i.active ? 'success' : 'neutral'}>{i.active ? 'Activo' : 'Inactivo'}</Badge> },
    {
      header: 'Acciones',
      align: 'right',
      cell: (i) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setForm({ insurer: i })}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(i)}>{i.active ? 'Desactivar' : 'Activar'}</Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      flush
      title="Seguros y convenios"
      description="Aseguradoras que los pacientes pueden registrar en su ficha."
      action={<Button onClick={() => setForm({ insurer: null })}><Icon name="plus" className="h-4 w-4" /> Nueva aseguradora</Button>}
    >
      <div className="border-b border-line p-4">
        <SearchInput label="Buscar aseguradoras" placeholder="Buscar aseguradora" value={search} onChange={setSearch} className="max-w-sm" />
      </div>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
        <EmptyState icon="shield" title="Sin aseguradoras" description="Registre las aseguradoras con las que trabaja la clínica." />
      ) : (
        <DataTable columns={columns} rows={data?.items ?? []} getKey={(i) => i.id} caption="Aseguradoras" />
      )}
      {data && <div className="px-4 pb-4"><Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} /></div>}
      <InsurerModal state={form} onClose={() => setForm(null)} onSaved={() => void reload()} />
    </Card>
  );
}
