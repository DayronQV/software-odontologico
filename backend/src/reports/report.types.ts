import type { PrismaService } from '../prisma/prisma.service';

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportResult {
  key: string;
  title: string;
  /** Texto con el período y los filtros aplicados (para encabezados y exportaciones). */
  subtitle: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
}

export interface ReportFilters {
  /** Inicio del período (inclusive) y fin (exclusivo), en UTC. */
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
  timezone: string;
  currency: string;
  opensAtMinute: number;
  closesAtMinute: number;
  officeId?: string;
  professionalId?: string;
  groupBy?: string;
}

export type ReportRunner = (db: PrismaService['db'], filters: ReportFilters) => Promise<ReportResult>;

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  /** Disponible para el odontólogo (siempre limitado a sus propios datos). */
  dentist: boolean;
  run: ReportRunner;
}

export const money = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;
export const percent = (part: number, total: number): number => (total === 0 ? 0 : Math.round((part / total) * 1000) / 10);
export const periodText = (f: ReportFilters): string => `Del ${f.fromLabel} al ${f.toLabel}`;
