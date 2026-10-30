import { Type } from 'class-transformer';
import {
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

/** Firma trazada en una pantalla táctil. */
export class SignTouchDto {
  /** Nombre de quien firma (paciente o tutor legal). */
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  signerName!: string;

  /** Imagen PNG del trazo, como data URL. */
  @IsString()
  @MaxLength(600_000)
  @Matches(/^data:image\/png;base64,/, { message: 'La firma debe ser una imagen PNG' })
  image!: string;

  /** Número de trazos (metadato biométrico). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  strokes?: number;

  /** Duración total del trazo en milisegundos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  durationMs?: number;

  /** touch, pen o mouse. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pointerType?: string;

  /** Presión máxima (0–1) si el dispositivo la entrega. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxPressure?: number;
}

export class VerifyOtpDto {
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  signerName!: string;
}
