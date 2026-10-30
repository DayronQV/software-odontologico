import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  /** Primer día del período (AAAA-MM-DD). Por defecto, hace 30 días. */
  @IsOptional()
  @Matches(DAY, { message: 'Fecha inválida (AAAA-MM-DD)' })
  from?: string;

  /** Último día del período, inclusive. Por defecto, hoy. */
  @IsOptional()
  @Matches(DAY, { message: 'Fecha inválida (AAAA-MM-DD)' })
  to?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;

  /** Agrupación del reporte de ingresos. */
  @IsOptional()
  @IsIn(['professional', 'procedure', 'office', 'day'])
  groupBy?: string;
}

export class ExportQueryDto extends ReportQueryDto {
  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';
}
