import { AlertKind, AlertSeverity } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAlertRuleDto {
  /** Texto que verá el personal en el badge (p. ej. "Alergia a penicilina"). */
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  label!: string;

  @IsEnum(AlertKind)
  kind!: AlertKind;

  /** Texto a buscar en la anamnesis (sin distinguir mayúsculas ni acentos). Obligatorio salvo anticoagulante/coagulopatía. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  keyword?: string;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  keyword?: string;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
