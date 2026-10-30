import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Level = 'critical' | 'warning' | 'info' | 'success';

const STYLES: Record<Level, string> = {
  critical: 'border-rose-700 bg-rose-600 text-white shadow-sm',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

/**
 * Badge de alerta de alta visibilidad. En la cabecera del expediente (RF-02) señala condiciones
 * críticas (alergia a penicilina, anticoagulados…). El nivel crítico no depende solo del color:
 * lleva ícono y texto en negrita.
 */
export function AlertBadge({ level = 'info', children }: { level?: Level; children: ReactNode }) {
  return (
    <span
      role={level === 'critical' ? 'alert' : 'status'}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
        level === 'critical' ? 'font-bold' : 'font-medium'
      } ${STYLES[level]}`}
    >
      {(level === 'critical' || level === 'warning') && <Icon name="alert" className="h-4 w-4" />}
      {children}
    </span>
  );
}
