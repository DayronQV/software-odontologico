import { ToothSurface } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Registro de un procedimiento REALIZADO. Una vez creado no se modifica ni se borra (RN-01). */
export class RegisterProcedureDto {
  @IsUUID()
  procedureId!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  /** Ítem aprobado del plan de tratamiento que se completa con este registro. */
  @IsOptional()
  @IsUUID()
  treatmentItemId?: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothCode?: number;

  @IsOptional()
  @IsEnum(ToothSurface)
  surface?: ToothSurface;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
