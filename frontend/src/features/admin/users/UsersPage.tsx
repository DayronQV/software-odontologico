import { useCallback, useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { SearchInput } from '../../../components/ui/SearchInput';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ROLE_LABELS, type Role } from '../../../lib/roles';
import { errorMessage, useResource } from '../../../lib/useResource';
import { CreateUserModal } from './CreateUserModal';
import { ChangeRoleModal } from './ChangeRoleModal';
import type { UserRow } from './types';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const loader = useCallback(() => api<UserRow[]>('/users'), []);
  const { data, error, loading, reload } = useResource(loader);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (data ?? []).filter(
      (u) => !text || u.fullName.toLowerCase().includes(text) || u.email.toLowerCase().includes(text),
    );
  }, [data, search]);

  const toggleActive = async (row: UserRow) => {
    try {
      await api(`/users/${row.id}/active`, { method: 'PATCH', body: { active: !row.active } });
      toast.push('success', row.active ? 'Usuario desactivado' : 'Usuario activado');
      await reload();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  const columns: Column<UserRow>[] = [
    {
      header: 'Usuario',
      cell: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.fullName}</p>
          <p className="text-xs text-slate-500">{r.email}</p>
        </div>
      ),
    },
    { header: 'Perfil', cell: (r) => <Badge tone="brand">{ROLE_LABELS[r.role as Role]}</Badge> },
    {
      header: 'Estado',
      cell: (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
    },
    {
      header: 'Acciones',
      align: 'right',
      cell: (r) =>
        r.id === me?.id ? (
          <span className="text-xs text-slate-400">Su cuenta</span>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
              Cambiar perfil
            </Button>
            <Button variant={r.active ? 'ghost' : 'secondary'} size="sm" onClick={() => void toggleActive(r)}>
              {r.active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <Card
      flush
      title="Usuarios del sistema"
      description="Cada persona accede con su propio perfil y verificación en dos pasos."
      action={
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" /> Nuevo usuario
        </Button>
      }
    >
      <div className="border-b border-line p-4">
        <SearchInput label="Buscar usuarios" placeholder="Buscar por nombre o correo" value={search} onChange={setSearch} className="max-w-sm" />
      </div>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="users" title="Sin usuarios" description="Ajuste la búsqueda o cree un usuario nuevo." />
      ) : (
        <DataTable columns={columns} rows={rows} getKey={(r) => r.id} caption="Usuarios del sistema" />
      )}
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={() => void reload()} />
      <ChangeRoleModal user={editing} onClose={() => setEditing(null)} onChanged={() => void reload()} />
    </Card>
  );
}
