import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../auth/password-policy';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  /** Contraseña inicial (el usuario debería cambiarla en su primer ingreso). */
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;

  /** Documento de identidad: se almacena cifrado (AES-256-GCM). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentId?: string;
}

export class SetRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}
