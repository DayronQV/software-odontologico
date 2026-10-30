import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateChairDto {
  @IsUUID()
  officeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateChairDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
