import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ALL_ROLES, ROLE_LABELS, type Role } from '../../lib/roles';
import { createUserSchema, type CreateUserForm } from '../../lib/schemas';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo conectar.');

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'RECEPCIONISTA' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/users', {
        method: 'POST',
        body: { ...values, documentId: values.documentId || undefined },
      });
      toast.push('success', 'Usuario creado');
      reset();
      onCreated();
      onClose();
    } catch (e) {
      toast.push('error', errorText(e));
    }
  });

  return (
    <Modal open={open} title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre completo" error={errors.fullName?.message} {...register('fullName')} />
        <Field label="Correo" type="email" error={errors.email?.message} {...register('email')} />
        <div className="space-y-1">
          <label htmlFor="new-role" className="block text-sm font-medium text-slate-700">
            Perfil
          </label>
          <select
            id="new-role"
            className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            {...register('role')}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Contraseña inicial"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo."
          error={errors.password?.message}
          {...register('password')}
        />
        <Field
          label="Documento de identidad (opcional)"
          hint="Se guarda cifrado."
          error={errors.documentId?.message}
          {...register('documentId')}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RoleModal({ user, onClose, onChanged }: { user: UserRow | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>('RECEPCIONISTA');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await api(`/users/${user.id}/role`, { method: 'PATCH', body: { role } });
      toast.push('success', 'Perfil actualizado');
      onChanged();
      onClose();
    } catch (e) {
      toast.push('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} title={`Cambiar perfil de ${user?.fullName ?? ''}`} onClose={onClose}>
      <label htmlFor="edit-role" className="block text-sm font-medium text-slate-700">
        Perfil
      </label>
      <select
        id="edit-role"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} loading={busy}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<UserRow[]>('/users'));
    } catch (e) {
      toast.push('error', errorText(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (row: UserRow) => {
    try {
      await api(`/users/${row.id}/active`, { method: 'PATCH', body: { active: !row.active } });
      toast.push('success', row.active ? 'Usuario desactivado' : 'Usuario activado');
      await load();
    } catch (e) {
      toast.push('error', errorText(e));
    }
  };

  const columns: Column<UserRow>[] = [
    { header: 'Nombre', cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { header: 'Correo', cell: (r) => r.email, hideOnSmall: true },
    { header: 'Perfil', cell: (r) => ROLE_LABELS[r.role] },
    {
      header: 'Estado',
      cell: (r) => (
        <span className={r.active ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>
          {r.active ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      cell: (r) =>
        r.id === me?.id ? (
          <span className="text-xs text-slate-400">Su cuenta</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(r)}>
              Perfil
            </Button>
            <Button variant={r.active ? 'danger' : 'secondary'} onClick={() => void toggleActive(r)}>
              {r.active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <Button onClick={() => setCreating(true)}>Nuevo usuario</Button>
      </div>
      {loading ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <DataTable columns={columns} rows={rows} getKey={(r) => r.id} caption="Usuarios del sistema" />
      )}
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
      <RoleModal user={editing} onClose={() => setEditing(null)} onChanged={() => void load()} />
    </div>
  );
}
