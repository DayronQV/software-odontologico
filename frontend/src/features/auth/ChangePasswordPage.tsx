import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ROLE_LABELS } from '../../lib/roles';
import { changePasswordSchema, type ChangePasswordForm } from '../../lib/schemas';

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
      setServerError(error instanceof ApiError ? error.message : 'No se pudo conectar.');
    }
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">Mi cuenta</h1>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Nombre</dt>
            <dd className="font-medium">{user?.fullName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Correo</dt>
            <dd className="font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Perfil</dt>
            <dd className="font-medium">{user ? ROLE_LABELS[user.role] : ''}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Cambiar contraseña</h2>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <Field
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <Field
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo."
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Field
            label="Confirmar nueva contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          {serverError && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {serverError}
            </p>
          )}
          <Button type="submit" loading={isSubmitting}>
            Guardar contraseña
          </Button>
        </form>
      </section>
    </div>
  );
}
