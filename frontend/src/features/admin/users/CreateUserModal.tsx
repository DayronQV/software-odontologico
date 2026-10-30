import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '../../../components/ui/Button';
import { Field, SelectField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { ALL_ROLES, ROLE_LABELS } from '../../../lib/roles';
import { createUserSchema, type CreateUserForm } from '../../../lib/schemas';
import { errorMessage } from '../../../lib/useResource';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateUserModal({ open, onClose, onCreated }: Props) {
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
      await api('/users', { method: 'POST', body: { ...values, documentId: values.documentId || undefined } });
      toast.push('success', 'Usuario creado');
      reset();
      onCreated();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={open} title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre completo" error={errors.fullName?.message} {...register('fullName')} />
        <Field label="Correo" type="email" error={errors.email?.message} {...register('email')} />
        <SelectField label="Perfil" error={errors.role?.message} {...register('role')}>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Contraseña inicial"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo."
          error={errors.password?.message}
          {...register('password')}
        />
        <Field label="Documento de identidad (opcional)" hint="Se guarda cifrado." error={errors.documentId?.message} {...register('documentId')} />
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
