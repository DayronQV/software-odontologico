import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { loginSchema, type LoginForm } from '../../lib/schemas';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const { phase, notice, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  if (phase === 'authenticated') return <Navigate to="/" replace />;
  if (phase === 'mfa_setup' || phase === 'mfa_verify' || phase === 'recovery_codes') {
    return <Navigate to="/mfa" replace />;
  }

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await login(email, password);
      navigate('/mfa');
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 429
          ? 'Demasiados intentos. Espere un minuto e inténtelo de nuevo.'
          : error instanceof ApiError
            ? error.message
            : 'No se pudo conectar con el servidor.',
      );
    }
  });

  return (
    <AuthShell title="Iniciar sesión" subtitle="Acceso para personal clínico y administrativo">
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Correo electrónico"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </AuthShell>
  );
}
