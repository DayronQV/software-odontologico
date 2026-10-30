import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

const QTY = { maxDecimalPlaces: 3 } as const;

export class ItemDto {
  @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'Código en mayúsculas, números y guiones (2–20)' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000)
  unitCost!: number;

  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0)
  @Max(1_000_000)
  minStock!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class EntryDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  locationId!: string;

  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0.001)
  @Max(1_000_000)
  quantity!: number;

  /** Costo unitario de esta compra; por defecto el del insumo. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class AdjustDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  locationId!: string;

  /** Con signo: positivo suma, negativo resta. */
  @Type(() => Number)
  @IsNumber(QTY)
  @Min(-1_000_000)
  @Max(1_000_000)
  quantity!: number;

  /** Obligatorio: queda en el kardex. */
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class TransferDto {
  @IsUUID()
  itemId!: string;

  @IsUUID()
  fromLocationId!: string;

  @IsUUID()
  toLocationId!: string;

  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0.001)
  @Max(1_000_000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class KardexQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class RecipeLineDto {
  @IsUUID()
  itemId!: string;

  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0.001)
  @Max(100_000)
  quantity!: number;
}

export class SetRecipeDto {
  @ApiProperty({ type: () => [RecipeLineDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}

export class AdjustConsumptionDto {
  @IsUUID()
  itemId!: string;

  /** Cantidad realmente usada (puede diferir de la receta). */
  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0)
  @Max(100_000)
  actualQuantity!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class CreateSupplyRequestDto {
  @IsUUID()
  appointmentId!: string;

  /** Si se omite, se arma con las recetas de consumo de los procedimientos de la cita. */
  @ApiProperty({ type: () => [RecipeLineDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines?: RecipeLineDto[];
}

export class SupplyQueryDto {
  /** Día (AAAA-MM-DD, hora de la clínica). Por defecto, hoy. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class CreateCountDto {
  @IsUUID()
  locationId!: string;
}

export class CountLineDto {
  @IsUUID()
  itemId!: string;

  @Type(() => Number)
  @IsNumber(QTY)
  @Min(0)
  @Max(1_000_000)
  countedQty!: number;
}

export class SetCountDto {
  @ApiProperty({ type: () => [CountLineDto] })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines!: CountLineDto[];
}
