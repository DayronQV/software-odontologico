import { CommissionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class RuleDto {
  @IsUUID()
  professionalId!: string;

  /** Vacío = aplica a todos los procedimientos del profesional. */
  @IsOptional()
  @IsUUID()
  procedureId?: string;

  @IsEnum(CommissionMode)
  mode!: CommissionMode;

  /** Porcentaje (0–100) o monto fijo según la modalidad. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  value!: number;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SimulateDto {
  @IsUUID()
  professionalId!: string;

  @IsUUID()
  procedureId!: string;

  /** Valor cobrado por el procedimiento (neto). Por defecto, el precio del catálogo. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  /** Para probar una modalidad sin crear la regla. */
  @ValidateIf((o: SimulateDto) => o.value !== undefined)
  @IsEnum(CommissionMode)
  mode?: CommissionMode;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number;
}

export class EntriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateSettlementDto {
  @IsUUID()
  professionalId!: string;

  /** Primer día del período (AAAA-MM-DD). */
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
