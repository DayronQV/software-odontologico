import {
  useId,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';

interface ShellProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  inputId: string;
  children: ReactNode;
}

/** Etiqueta + control + ayuda/error anunciado, común a todos los campos. */
function FieldShell({ label, error, hint, inputId, children }: ShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'block w-full rounded-lg border bg-white px-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';
const controlClass = (error: string | undefined, extra: string) =>
  `${CONTROL} ${error ? 'border-rose-400' : 'border-line'} ${extra}`;

interface BaseProps {
  label: string;
  error?: string;
  hint?: ReactNode;
}

export function Field({
  label,
  error,
  hint,
  className = '',
  id,
  ...rest
}: BaseProps & ComponentPropsWithRef<'input'>) {
  const auto = useId();
  const inputId = id ?? auto;
  const [visible, setVisible] = useState(false);
  const isPassword = rest.type === 'password';
  const input = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${inputId}-error` : undefined}
      className={controlClass(error, `min-h-11 ${isPassword ? 'pr-12' : ''} ${className}`)}
      {...rest}
      type={isPassword && visible ? 'text' : rest.type}
    />
  );
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={inputId}>
      {isPassword ? (
        <div className="relative">
          {input}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} />
          </button>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className = '',
  id,
  children,
  ...rest
}: BaseProps & ComponentPropsWithRef<'select'>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={inputId}>
      <select
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={controlClass(error, `min-h-11 ${className}`)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  className = '',
  id,
  ...rest
}: BaseProps & ComponentPropsWithRef<'textarea'>) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} inputId={inputId}>
      <textarea
        id={inputId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={controlClass(error, `py-2 ${className}`)}
        {...rest}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  className = '',
  ...rest
}: { label: ReactNode; hint?: ReactNode } & ComponentPropsWithRef<'input'>) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 py-2 ${className}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-200"
        {...rest}
      />
      <span className="text-sm text-slate-700">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
