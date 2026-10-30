import { ApiProperty } from '@nestjs/swagger';
import { ContactChannel, Sex } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MedicalHistoryDto } from '../medical-history/dto/medical-history.dto';
import {
  EmergencyContactDto,
  GuardianDto,
  PatientInsuranceDto,
  PHONE_MESSAGE,
  PHONE_REGEX,
} from './patient-parts.dto';

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  /** Documento de identidad (se guarda cifrado). Un menor puede no tenerlo. */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  documentId?: string;

  /** Fecha de nacimiento (AAAA-MM-DD). */
  @IsDateString()
  birthDate!: string;

  @IsEnum(Sex)
  sex!: Sex;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  occupation?: string;

  /** Canal preferido para recordatorios (RF-11). */
  @IsOptional()
  @IsEnum(ContactChannel)
  preferredChannel?: ContactChannel;

  /** El paciente autoriza que la clínica lo contacte (sin esto no se envían mensajes). */
  @IsOptional()
  @IsBoolean()
  contactConsent?: boolean;

  @ApiProperty({ type: () => EmergencyContactDto })
  @IsDefined({ message: 'El contacto de emergencia es obligatorio' })
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact!: EmergencyContactDto;

  /** Obligatorio si el paciente es menor de 18 años. */
  @ApiProperty({ type: () => GuardianDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuardianDto)
  guardian?: GuardianDto;

  @ApiProperty({ type: () => PatientInsuranceDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatientInsuranceDto)
  insurance?: PatientInsuranceDto;

  /** Se puede registrar al dar de alta o después (obligatoria antes de la atención). */
  @ApiProperty({ type: () => MedicalHistoryDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => MedicalHistoryDto)
  medicalHistory?: MedicalHistoryDto;
}
