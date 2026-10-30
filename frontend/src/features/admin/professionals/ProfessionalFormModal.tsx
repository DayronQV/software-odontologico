import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField } from '../../../components/ui/Field';
import { InlineNotice } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage, useResource } from '../../../lib/useResource';
import type { Professional } from '../../catalog/types';
import type { UserRow } from '../users/types';

const schema = z.object({
  userId: z.string().optional(),
  kind: z.enum(['GENERAL', 'SPECIALIST']),
  specialty: z.string().trim().max(80).optional(),
  licenseNumber: z.string().trim().max(40).optional(),
});
type Form = z.infer<typeof schema>;

interface Props {
  state: { professional: Professional | null } | null;
  /** Ids de usuarios que ya son profesionales (no se vuelven a ofrecer). */
  takenUserIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProfessionalFormModal({ state, takenUserIds, onClose, onSaved }: Props) {
  const toast = useToast();
  const professional = state?.professional ?? null;
  const loader = useCallback(() => (state && !professional ? api<UserRow[]>('/users') : Promise.resolve([] as UserRow[])), [state, professional]);
  const { data: users } = useResource(loader);
  const candidates = (users ?? []).filter((u) => u.role === 'ODONTOLOGO' && u.active && !takenUserIds.includes(u.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { kind: 'GENERAL' } });

  useEffect(() => {
    if (state) {
      reset({
        userId: '',
        kind: professional?.kind ?? 'GENERAL',
        specialty: professional?.specialty ?? '',
        licenseNumber: professional?.licenseNumber ?? '',
      });
    }
  }, [state, professional, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = { kind: values.kind, specialty: values.specialty || undefined, licenseNumber: values.licenseNumber || undefined };
      if (professional) {
        await api(`/catalog/professionals/${professional.id}`, { method: 'PATCH', body });
      } else {
        if (!values.userId) {
          toast.push('error', 'Seleccione el usuario odontólogo');
          return;
        }
        await api('/catalog/professionals', { method: 'POST', body: { ...body, userId: values.userId } });
      }
      toast.push('success', professional ? 'Profesional actualizado' : 'Profesional registrado');
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={!!state} title={professional ? 'Editar profesional' : 'Nuevo profesional'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {!professional && (
          <>
            <SelectField label="Usuario odontólogo" {...register('userId')}>
              <option value="">Seleccione…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName} — {u.email}</option>
              ))}
            </SelectField>
            {candidates.length === 0 && users && (
              <InlineNotice>No hay usuarios con perfil Odontólogo sin registrar. Cree primero el usuario en la pestaña Usuarios.</InlineNotice>
            )}
          </>
        )}
        <SelectField label="Tipo" error={errors.kind?.message} {...register('kind')}>
          <option value="GENERAL">Odontólogo general</option>
          <option value="SPECIALIST">Especialista</option>
        </SelectField>
        <Field label="Especialidad" placeholder="Ortodoncia, endodoncia…" error={errors.specialty?.message} {...register('specialty')} />
        <Field label="Registro profesional" error={errors.licenseNumber?.message} {...register('licenseNumber')} />
        <p className="text-xs text-slate-500">El horario laboral se configura después, con el botón «Horario».</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
