import type { ComponentPropsWithoutRef } from 'react';
import { Icon } from './Icon';

interface SearchInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

/** Buscador con ícono; `label` se anuncia a lectores de pantalla aunque no se vea. */
export function SearchInput({ value, onChange, label, className = '', ...rest }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        {...rest}
      />
    </div>
  );
}
