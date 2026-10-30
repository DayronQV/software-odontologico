import { StockPolicy } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
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

/** Parámetros globales de la clínica (todos opcionales: solo se cambia lo enviado). */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  clinicName?: string;

  /** Zona horaria IANA, p. ej. America/Bogota. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda debe ser un código ISO de 3 letras (USD, COP…)' })
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  /** Apertura en minutos desde las 00:00 (07:00 = 420). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  opensAtMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  closesAtMinute?: number;

  /** Antelación en horas de los recordatorios automáticos (por defecto 48 y 24). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(336, { each: true })
  reminderHours?: number[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;

  /** Horas durante las que una nota de evolución sigue siendo editable (RF-05). Por defecto 24. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  noteLockHours?: number;

  /** Qué hacer si el descargo automático de insumos no alcanza el stock (RF-14). */
  @IsOptional()
  @IsEnum(StockPolicy)
  stockPolicy?: StockPolicy;

  /** Días de antelación de la alerta de insumos por vencer. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiryAlertDays?: number;
}
