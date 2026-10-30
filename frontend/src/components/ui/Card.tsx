import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Quita el relleno interno (tablas, calendarios). */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** Superficie blanca con borde suave: la unidad básica de contenido. */
export function Card({ title, description, action, flush = false, className = '', children }: CardProps) {
  return (
    <section className={`rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
