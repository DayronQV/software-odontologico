import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProfessionalKind } from '@prisma/client';

export class ScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class CreateProfessionalDto {
  /** Usuario con perfil Odontólogo que será el profesional. */
  @IsUUID()
  userId!: string;

  @IsEnum(ProfessionalKind)
  kind!: ProfessionalKind;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;

  @ApiProperty({ type: () => [ScheduleSlotDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule?: ScheduleSlotDto[];
}

export class UpdateProfessionalDto {
  @IsOptional()
  @IsEnum(ProfessionalKind)
  kind?: ProfessionalKind;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReplaceScheduleDto {
  @ApiProperty({ type: () => [ScheduleSlotDto] })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots!: ScheduleSlotDto[];
}
