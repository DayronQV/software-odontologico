import { ApiProperty } from '@nestjs/swagger';
import { PerioSite } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PerioSiteDto {
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode!: number;

  @IsEnum(PerioSite)
  site!: PerioSite;

  /** Profundidad al sondaje en mm (0–15). */
  @IsInt()
  @Min(0)
  @Max(15)
  probingDepth!: number;

  /** Recesión en mm: positivo = encía retraída; negativo = encía sobre la unión cemento-esmalte. */
  @IsInt()
  @Min(-10)
  @Max(15)
  gingivalMargin!: number;

  @IsBoolean()
  bleeding!: boolean;
}

export class PerioToothDto {
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode!: number;

  /** Furca: 0 = sin compromiso; 1–3 = grados I–III. */
  @IsInt()
  @Min(0)
  @Max(3)
  furcation!: number;

  /** Movilidad: 0–3. */
  @IsInt()
  @Min(0)
  @Max(3)
  mobility!: number;
}

export class SavePerioChartDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: () => [PerioSiteDto] })
  @IsArray()
  @ArrayMaxSize(52 * 6)
  @ValidateNested({ each: true })
  @Type(() => PerioSiteDto)
  sites!: PerioSiteDto[];

  @ApiProperty({ type: () => [PerioToothDto] })
  @IsArray()
  @ArrayMaxSize(52)
  @ValidateNested({ each: true })
  @Type(() => PerioToothDto)
  teeth!: PerioToothDto[];
}

export class CompareQueryDto {
  @IsUUID()
  before!: string;

  @IsUUID()
  after!: string;
}
