import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowPartialAuth, AnyRole, CurrentUser, Public, ReqMeta } from '../common/decorators';
import { AUTH_THROTTLE } from '../common/throttle';
import type { AuthUser, RequestMetaData } from '../common/types';
import { AuthService, toUserView } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  LoginResponseDto,
  MfaCodeDto,
  MfaEnableResponseDto,
  MfaSetupResponseDto,
  MfaVerifyDto,
  RefreshDto,
  TokenPairDto,
} from './dto/auth.dto';

const authThrottle = { default: { limit: AUTH_THROTTLE.limit, ttl: AUTH_THROTTLE.ttl } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Paso 1: credenciales. Devuelve tokens SIN MFA verificado (alcance restringido). */
  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('login')
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto, @ReqMeta() meta: RequestMetaData) {
    return this.auth.login(dto, meta);
  }

  /** Paso 2a (primer ingreso): genera el secreto TOTP y el QR. */
  @AnyRole()
  @AllowPartialAuth()
  @ApiBearerAuth()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('mfa/setup')
  @ApiOkResponse({ type: MfaSetupResponseDto })
  setupMfa(@CurrentUser() user: AuthUser) {
    return this.auth.setupMfa(user);
  }

  /** Paso 2b (primer ingreso): confirma el primer código; entrega códigos de recuperación y tokens completos. */
  @AnyRole()
  @AllowPartialAuth()
  @ApiBearerAuth()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('mfa/enable')
  @ApiOkResponse({ type: MfaEnableResponseDto })
  enableMfa(@Body() dto: MfaCodeDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMetaData) {
    return this.auth.enableMfa(user, dto.code, meta);
  }

  /** Paso 2 (ingresos siguientes): valida TOTP o código de recuperación y entrega tokens completos. */
  @AnyRole()
  @AllowPartialAuth()
  @ApiBearerAuth()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('mfa/verify')
  @ApiOkResponse({ type: TokenPairDto })
  verifyMfa(@Body() dto: MfaVerifyDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMetaData) {
    if (!dto.code && !dto.recoveryCode) {
      throw new BadRequestException('Envíe code o recoveryCode');
    }
    return this.auth.verifyMfa(user, dto, meta);
  }

  /** Rota el refresh token y renueva el access token. */
  @Public()
  @Throttle(authThrottle)
  @HttpCode(200)
  @Post('refresh')
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto, @ReqMeta() meta: RequestMetaData) {
    return this.auth.refresh(dto.refreshToken, meta);
  }

  @AnyRole()
  @AllowPartialAuth()
  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMetaData): Promise<void> {
    await this.auth.logout(user, meta);
  }

  @AnyRole()
  @ApiBearerAuth()
  @HttpCode(204)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMetaData,
  ): Promise<void> {
    await this.auth.changePassword(user, dto, meta);
  }

  /** Datos del usuario actual. También renueva la inactividad (sirve de "keep-alive"). */
  @AnyRole()
  @AllowPartialAuth()
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user: toUserView(user), mfaVerified: user.mfaVerified };
  }
}
