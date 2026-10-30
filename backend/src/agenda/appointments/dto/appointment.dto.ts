import { AppointmentStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  professionalId!: string;

  @IsUUID()
  chairId!: string;

  /** Procedimientos a realizar (al menos uno). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  procedureIds!: string[];

  /** Inicio (ISO-8601). */
  @IsDateString()
  startAt!: string;

  /** Fin (ISO-8601). Si se omite, se calcula con la duración de los procedimientos. */
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  startAt!: string;

  /** Si se omite, se conserva la duración actual de la cita. */
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsUUID()
  chairId?: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;
}

export class ChangeStatusDto {
  @IsEnum(AppointmentStatus)
  to!: AppointmentStatus;

  /** Obligatorio al cancelar. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AppointmentQueryDto {
  /** Inicio del rango (ISO-8601). Por defecto, el comienzo de hoy. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin del rango (ISO-8601, exclusivo). Máximo 62 días desde `from`. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsUUID()
  chairId?: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
