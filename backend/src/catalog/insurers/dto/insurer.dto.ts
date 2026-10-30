import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInsurerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

export class UpdateInsurerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
