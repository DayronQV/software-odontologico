import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../lib/auth';
import { ROLE_LABELS } from '../../lib/roles';
import { changePasswordSchema, type ChangePasswordForm } from '../../lib/schemas';
import { errorMessage } from '../../lib/useResource';

export function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await changePassword(currentPassword, newPassword);
      toast.push('success', 'Contraseña actualizada. Se cerraron sus otras sesiones.');
      reset();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Mi cuenta" />
      <div className="space-y-6">
        <Card title="Datos de la cuenta">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Nombre</dt><dd className="mt-0.5 text-sm font-medium text-slate-800">{user?.fullName}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Correo</dt><dd className="mt-0.5 text-sm text-slate-800">{user?.email}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Perfil</dt><dd className="mt-0.5 text-sm text-slate-800">{user ? ROLE_LABELS[user.role] : ''}</dd></div>
          </dl>
        </Card>

        <Card title="Cambiar contraseña" description="Al cambiarla se cierran las demás sesiones abiertas.">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field label="Contraseña actual" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
            <Field label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo." error={errors.newPassword?.message} {...register('newPassword')} />
            <Field label="Confirmar nueva contraseña" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
            {serverError && <InlineError>{serverError}</InlineError>}
            <Button type="submit" loading={isSubmitting}>Guardar contraseña</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
