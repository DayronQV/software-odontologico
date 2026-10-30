import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../password-policy';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class MfaCodeDto {
  /** Código TOTP de 6 dígitos de la app autenticadora. */
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}

export class MfaVerifyDto {
  /** Código TOTP de 6 dígitos. */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code?: string;

  /** Alternativa: código de recuperación (formato XXXXXXXXXX-XXXXXXXXXX). */
  @IsOptional()
  @Matches(/^[A-Fa-f0-9]{10}-[A-Fa-f0-9]{10}$/, { message: 'Código de recuperación inválido' })
  recoveryCode?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}

export class TokenPairDto {
  accessToken!: string;
  refreshToken!: string;
  /** Segundos de vida del access token. */
  expiresIn!: number;
}

export class LoginResponseDto extends TokenPairDto {
  // Tipo literal (no clase): el plugin de Swagger genera rutas absolutas inválidas en Windows
  // cuando una propiedad referencia a otra clase.
  user!: { id: string; email: string; fullName: string; role: string };
  /** enrolled: ya configuró su app autenticadora. verified: MFA validado en esta sesión. */
  mfa!: { enrolled: boolean; verified: boolean };
}

export class MfaSetupResponseDto {
  /** Secreto base32 (para ingreso manual). */
  secret!: string;
  otpauthUrl!: string;
  /** Imagen QR como data URL (PNG). */
  qrDataUrl!: string;
}

export class MfaEnableResponseDto extends TokenPairDto {
  /** Se muestran UNA sola vez: guardarlos en un lugar seguro. */
  recoveryCodes!: string[];
}
