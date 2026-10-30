import { Type } from 'class-transformer';
import {
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

const TEXT = 4000;

/** Nota de evolución SOEP: Subjetivo, Objetivo, Evaluación, Plan. */
export class CreateNoteDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  subjective!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  objective!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  assessment!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  plan!: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  subjective?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  objective?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  assessment?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TEXT)
  plan?: string;
}

/** Firmar exige volver a escribir la contraseña (reautenticación). */
export class SignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class CreateAddendumDto extends SignDto {
  @IsString()
  @MinLength(5)
  @MaxLength(TEXT)
  content!: string;
}

export class CreateVitalSignsDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(300)
  systolic?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  diastolic?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(250)
  pulse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  oxygenSaturation?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(400)
  weightKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
