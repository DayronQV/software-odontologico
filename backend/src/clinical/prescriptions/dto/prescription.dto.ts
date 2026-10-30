import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  /** Medicamento del catálogo (opcional: también se admite texto libre). */
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  dose!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  frequency!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  duration!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string;
}

export class CheckPrescriptionDto {
  @ApiProperty({ type: () => [PrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}

export class CreatePrescriptionDto extends CheckPrescriptionDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Justificación para emitir pese a una alerta de alergia (mínimo 10 caracteres). */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  allergyOverrideReason?: string;
}

export class VoidPrescriptionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class MedicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  activeIngredient!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  presentation!: string;

  /** Familias o ingredientes para cruzar con alergias (p. ej. "penicilina"). */
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  allergyGroups!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
