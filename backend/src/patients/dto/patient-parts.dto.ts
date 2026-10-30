import {
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;
export const PHONE_MESSAGE = 'Teléfono inválido (7 a 20 dígitos, puede incluir + - ( ) )';

export class EmergencyContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  relationship!: string;

  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone!: string;
}

/** Tutor legal: obligatorio cuando el paciente es menor de edad. */
export class GuardianDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  relationship!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentId?: string;

  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class PatientInsuranceDto {
  @IsUUID()
  insurerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  policyNumber!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  coveragePercent?: number;
}
