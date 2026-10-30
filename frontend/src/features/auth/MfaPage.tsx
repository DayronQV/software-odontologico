import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAuth, type MfaSetupData } from '../../lib/auth';
import { recoverySchema, totpSchema } from '../../lib/schemas';
import { AuthShell } from './AuthShell';

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'No se pudo conectar con el servidor.';

/** Primer ingreso: escanear el QR y confirmar con un primer código. */
function SetupStep() {
  const { setupMfa, enableMfa, logout } = useAuth();
  const [data, setData] = useState<MfaSetupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>({ resolver: zodResolver(totpSchema) });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setupMfa().then(setData, (e) => setError(messageOf(e)));
  }, [setupMfa]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await enableMfa(code);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  return (
    <AuthShell
      title="Configure la verificación en dos pasos"
      subtitle="Es obligatoria para acceder a expedientes e información financiera"
    >
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Instale Google Authenticator, Microsoft Authenticator o Authy.</li>
        <li>Escanee este código QR (o ingrese la clave manualmente).</li>
        <li>Escriba el código de 6 dígitos que muestra la aplicación.</li>
      </ol>
      {data ? (
        <div className="mb-4 flex flex-col items-center gap-2">
          <img src={data.qrDataUrl} alt="Código QR para la app autenticadora" className="h-48 w-48" />
          <p className="text-xs text-slate-500">Clave manual:</p>
          <code className="break-all rounded bg-slate-100 px-2 py-1 text-sm">{data.secret}</code>
        </div>
      ) : (
        !error && <p className="mb-4 text-center text-sm text-slate-500">Generando código…</p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={errors.code?.message}
          {...register('code')}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting} disabled={!data}>
          Activar y continuar
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => void logout()}>
          Cancelar
        </Button>
      </form>
    </AuthShell>
  );
}

/** Ingresos siguientes: código TOTP o, si no tiene el teléfono, un código de recuperación. */
function VerifyStep() {
  const { verifyMfa, logout } = useAuth();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totp = useForm<{ code: string }>({ resolver: zodResolver(totpSchema) });
  const recovery = useForm<{ recoveryCode: string }>({ resolver: zodResolver(recoverySchema) });

  const submit = async (input: { code?: string; recoveryCode?: string }) => {
    setError(null);
    try {
      await verifyMfa(input);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <AuthShell title="Verificación en dos pasos" subtitle="Confirme que es usted para continuar">
      {useRecovery ? (
        <form onSubmit={recovery.handleSubmit((v) => submit(v))} noValidate className="space-y-4">
          <Field
            label="Código de recuperación"
            autoComplete="off"
            hint="Formato XXXXXXXXXX-XXXXXXXXXX. Cada código sirve una sola vez."
            error={recovery.formState.errors.recoveryCode?.message}
            {...recovery.register('recoveryCode')}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={recovery.formState.isSubmitting}>
            Verificar
          </Button>
        </form>
      ) : (
        <form onSubmit={totp.handleSubmit((v) => submit(v))} noValidate className="space-y-4">
          <Field
            label="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            error={totp.formState.errors.code?.message}
            {...totp.register('code')}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={totp.formState.isSubmitting}>
            Verificar
          </Button>
        </form>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setUseRecovery((v) => !v);
          }}
        >
          {useRecovery ? 'Usar la app autenticadora' : 'Usar un código de recuperación'}
        </Button>
        <Button variant="secondary" onClick={() => void logout()}>
          Cancelar
        </Button>
      </div>
    </AuthShell>
  );
}

/** Se muestran una sola vez, tras activar el MFA. */
function RecoveryStep() {
  const { recoveryCodes, acknowledgeRecovery } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);

  return (
    <AuthShell
      title="Guarde sus códigos de recuperación"
      subtitle="Sirven si pierde el acceso a su aplicación autenticadora"
    >
      <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Se muestran <strong>una sola vez</strong>. Cada código funciona una vez. Guárdelos en un lugar
        seguro.
      </p>
      <ul className="grid grid-cols-1 gap-2 rounded-lg bg-slate-100 p-3 font-mono text-sm sm:grid-cols-2">
        {recoveryCodes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-3">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
        >
          Copiar códigos
        </Button>
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        He guardado mis códigos de recuperación
      </label>
      <Button
        className="mt-4 w-full"
        disabled={!saved}
        onClick={() => {
          acknowledgeRecovery();
          navigate('/', { replace: true });
        }}
      >
        Continuar
      </Button>
    </AuthShell>
  );
}

export function MfaPage() {
  const { phase } = useAuth();

  if (phase === 'loading') return null;
  if (phase === 'anonymous') return <Navigate to="/login" replace />;
  if (phase === 'authenticated') return <Navigate to="/" replace />;
  if (phase === 'mfa_setup') return <SetupStep />;
  if (phase === 'recovery_codes') return <RecoveryStep />;
  return <VerifyStep />;
}
