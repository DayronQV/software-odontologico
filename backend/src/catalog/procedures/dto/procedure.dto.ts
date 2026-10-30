import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CatalogQueryDto } from '../../dto/catalog-query.dto';

export class CreateProcedureDto {
  /** Código interno, en mayúsculas (p. ej. LIMP-01). */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,19}$/, { message: 'Código inválido (letras, números y guiones)' })
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  category!: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  basePrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  labCost?: number;

  @IsOptional()
  @IsBoolean()
  requiresConsent?: boolean;
}

export class UpdateProcedureDto extends PartialType(CreateProcedureDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ProcedureQueryDto extends CatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}
