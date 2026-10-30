import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOfficeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}

export class UpdateOfficeDto extends PartialType(CreateOfficeDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
