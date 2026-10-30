export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportData {
  key: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
}

export interface ReportInfo {
  key: string;
  title: string;
  description: string;
}

export interface Dashboard {
  period: { from: string; to: string };
  currency: string;
  cached: boolean;
  kpis: {
    revenue: number;
    invoices: number;
    appointments: number;
    noShowRate: number;
    occupancy: number;
    budgetConversion: number;
    lowStock: number;
    expiring: number;
    pendingCommissions: number;
  };
  revenueByDay: Array<{ label: string; value: number }>;
  revenueByProfessional: Array<{ label: string; value: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
}

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD_CREDIT: 'Tarjeta de crédito',
  CARD_DEBIT: 'Tarjeta de débito',
  TRANSFER: 'Transferencia',
  INSURANCE: 'Seguro',
};

export const GROUP_LABELS: Record<string, string> = { professional: 'Profesional', procedure: 'Procedimiento', office: 'Consultorio', day: 'Día' };

/** Formatea una celda según el tipo de columna. */
export function formatCell(value: string | number | null | undefined, type: ColumnType, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return new Intl.NumberFormat('es', { style: 'currency', currency }).format(Number(value));
  if (type === 'percent') return `${value} %`;
  if (type === 'date' && typeof value === 'string' && value.includes('T')) return new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  return String(value);
}
