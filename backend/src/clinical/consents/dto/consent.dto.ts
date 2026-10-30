import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateConsentDto {
  @IsUUID()
  procedureId!: string;

  /** Odontólogo responsable (id de usuario). Obligatorio si quien crea no es odontólogo ni hay cita. */
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  treatmentItemId?: string;

  /** Diente al que aplica (FDI), si corresponde. */
  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode?: number;
}

export class CreateConsentTemplateDto {
  @IsUUID()
  procedureId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title!: string;

  /** Texto legal. Admite {{paciente}}, {{procedimiento}}, {{profesional}}, {{clinica}}, {{fecha}}, {{diente}}. */
  @IsString()
  @MinLength(50)
  @MaxLength(8000)
  body!: string;
}

export class ConsentTemplateQueryDto {
  @IsOptional()
  @IsUUID()
  procedureId?: string;
}
