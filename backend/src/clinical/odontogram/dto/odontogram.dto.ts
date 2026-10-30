import { FindingStatus, FindingType, OdontogramDentition, ToothSurface } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFindingDto {
  /** Código FDI del diente (11–48 permanentes, 51–85 temporales). */
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode!: number;

  @IsEnum(ToothSurface)
  surface!: ToothSurface;

  @IsEnum(FindingType)
  type!: FindingType;

  /** Existente (por defecto), planificado o realizado. */
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

/** Cambiar el tipo o el estado de un hallazgo cierra el anterior y crea uno nuevo (historial). */
export class UpdateFindingDto {
  @IsOptional()
  @IsEnum(FindingType)
  type?: FindingType;

  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class RemoveFindingDto {
  /** Motivo de la corrección (queda en el historial). */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class SetDentitionDto {
  @IsEnum(OdontogramDentition)
  dentition!: OdontogramDentition;
}

export class OdontogramQueryDto {
  /** Ver el odontograma tal como estaba en una fecha (ISO-8601). */
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode?: number;
}
