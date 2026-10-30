import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Anamnesis (RF-02). Una lista vacía significa "el paciente refiere ninguno": registrarla así
 * es lo que habilita la atención clínica.
 */
export class MedicalHistoryDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  systemicDiseases!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  drugAllergies!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  coagulopathies!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  surgicalHistory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  currentMedication?: string;

  @IsOptional()
  @IsBoolean()
  anticoagulated?: boolean;
}
