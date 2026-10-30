import type { ReactNode } from 'react';

type Level = 'critical' | 'warning' | 'info' | 'success';

const STYLES: Record<Level, string> = {
  critical: 'border-red-700 bg-red-600 text-white',
  warning: 'border-amber-600 bg-amber-100 text-amber-950',
  info: 'border-sky-600 bg-sky-50 text-sky-950',
  success: 'border-emerald-600 bg-emerald-50 text-emerald-950',
};

const ICONS: Record<Level, string> = { critical: '⚠', warning: '!', info: 'i', success: '✓' };

/**
 * Badge de alerta de alta visibilidad. Se usará en la cabecera del expediente (RF-02) para
 * condiciones críticas (alergia a penicilina, anticoagulados…); el nivel crítico no depende
 * solo del color: lleva ícono y texto en negrita.
 */
export function AlertBadge({ level = 'info', children }: { level?: Level; children: ReactNode }) {
  return (
    <span
      role={level === 'critical' ? 'alert' : 'status'}
      className={`inline-flex min-h-8 items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-bold ${STYLES[level]}`}
    >
      <span aria-hidden="true">{ICONS[level]}</span>
      {children}
    </span>
  );
}
