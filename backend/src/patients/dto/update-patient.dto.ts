import { OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePatientDto } from './create-patient.dto';

/** Todos los campos son opcionales; la anamnesis se edita en su propio endpoint. */
export class UpdatePatientDto extends PartialType(OmitType(CreatePatientDto, ['medicalHistory'] as const)) {
  /** Desactivar en lugar de borrar: el paciente conserva su historia. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
