import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';

/** Marco centrado para las pantallas previas al ingreso (login, MFA). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <Icon name="tooth" className="h-8 w-8" />
          </span>
          <p className="text-xl font-semibold tracking-tight text-slate-900">SIGO-Dental</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          <h1 className="text-center text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
