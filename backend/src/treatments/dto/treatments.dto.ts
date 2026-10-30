import { ToothSurface } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;
}

export class AddPhaseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class AddItemDto {
  @IsUUID()
  phaseId!: string;

  @IsUUID()
  procedureId!: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode?: number;

  @IsOptional()
  @IsEnum(ToothSurface)
  surface?: ToothSurface;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  sessionNumber?: number;

  /** Honorarios; por defecto, el precio base del procedimiento. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fee?: number;

  /** Costo de laboratorio; por defecto, el del procedimiento. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  labCost?: number;

  /** Hallazgo del odontograma que originó el ítem. */
  @IsOptional()
  @IsUUID()
  findingId?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @IsUUID()
  phaseId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  sessionNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  fee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  labCost?: number;
}

export class CreateBudgetDto {
  /** Descuento sobre honorarios (0–100). Sobre el umbral configurado requiere autorización. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class AuthorizeDiscountDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  note!: string;
}

export class RequestApprovalDto {
  /** Ítems que el paciente aprueba. Si se omite, se aprueban todos los pendientes (aprobación total). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  itemIds?: string[];
}
