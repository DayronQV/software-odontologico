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
import type { Office } from '../../catalog/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  address: z.string().trim().max(200).optional(),
});
type Form = z.infer<typeof schema>;

interface Props {
  state: { office: Office | null } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function OfficeFormModal({ state, onClose, onSaved }: Props) {
  const toast = useToast();
  const office = state?.office ?? null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (state) reset({ name: office?.name ?? '', address: office?.address ?? '' });
  }, [state, office, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = { name: values.name, address: values.address || undefined };
      if (office) await api(`/catalog/offices/${office.id}`, { method: 'PATCH', body });
      else await api('/catalog/offices', { method: 'POST', body });
      toast.push('success', office ? 'Consultorio actualizado' : 'Consultorio creado');
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={!!state} title={office ? 'Editar consultorio' : 'Nuevo consultorio'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre" error={errors.name?.message} {...register('name')} />
        <Field label="Ubicación (opcional)" error={errors.address?.message} {...register('address')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
