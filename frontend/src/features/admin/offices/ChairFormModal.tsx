import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/useResource';
import type { Chair } from '../../catalog/types';

const schema = z.object({ name: z.string().trim().min(1, 'Ingrese un nombre').max(60) });
type Form = z.infer<typeof schema>;

interface Props {
  state: { officeId: string; chair: Chair | null } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ChairFormModal({ state, onClose, onSaved }: Props) {
  const toast = useToast();
  const chair = state?.chair ?? null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (state) reset({ name: chair?.name ?? '' });
  }, [state, chair, reset]);

  const onSubmit = handleSubmit(async ({ name }) => {
    if (!state) return;
    try {
      if (chair) await api(`/catalog/chairs/${chair.id}`, { method: 'PATCH', body: { name } });
      else await api('/catalog/chairs', { method: 'POST', body: { officeId: state.officeId, name } });
      toast.push('success', chair ? 'Sillón actualizado' : 'Sillón agregado');
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={!!state} title={chair ? 'Renombrar sillón' : 'Nuevo sillón dental'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre del sillón" placeholder="Sillón 1" error={errors.name?.message} {...register('name')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
