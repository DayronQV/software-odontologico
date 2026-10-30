import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

interface FieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

/** Campo de formulario accesible: etiqueta, mensaje de error anunciado y estado inválido. */
export function Field({ label, error, hint, className = '', id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`block min-h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-900 ${
          error ? 'border-red-600' : 'border-slate-300'
        } ${className}`}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
