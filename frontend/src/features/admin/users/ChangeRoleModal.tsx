import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { SelectField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { ALL_ROLES, ROLE_LABELS, type Role } from '../../../lib/roles';
import { errorMessage } from '../../../lib/useResource';
import type { UserRow } from './types';

interface Props {
  user: UserRow | null;
  onClose: () => void;
  onChanged: () => void;
}

export function ChangeRoleModal({ user, onClose, onChanged }: Props) {
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
      toast.push('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} title={`Cambiar perfil de ${user?.fullName ?? ''}`} onClose={onClose}>
      <SelectField label="Perfil" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </SelectField>
      <p className="mt-3 text-sm text-slate-500">El cambio se aplica de inmediato en todas sus sesiones.</p>
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
