import type { ReactNode } from 'react';

/** Marco centrado para las pantallas previas al ingreso (login, MFA). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <p className="text-center text-2xl font-extrabold text-brand-700">🦷 SIGO-Dental</p>
        <h1 className="mt-4 text-center text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
