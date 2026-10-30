import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
  secondary: 'border border-line bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
};

// 44 px de alto: objetivo táctil cómodo para tablets junto al sillón. `sm` solo en filas de tablas.
const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-10 px-3 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-w-11 items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? 'Procesando…' : children}
    </button>
  );
}
