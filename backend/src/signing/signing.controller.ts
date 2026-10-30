import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuditAction, AuditEntity, Roles } from '../common/decorators';
import { CLINICAL_STAFF } from '../common/role-groups';
import { AUTH_THROTTLE } from '../common/throttle';
import { SignTouchDto, VerifyOtpDto } from './dto/signing.dto';
import { SigningService } from './signing.service';

/**
 * Firma del paciente o su tutor (RF-06): en pantalla táctil o con código OTP.
 * La operan el odontólogo o el asistente junto al paciente.
 */
@ApiTags('signing')
@ApiBearerAuth()
@Roles(...CLINICAL_STAFF)
@AuditEntity('Signing')
@Controller('signing')
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.signing.get(id);
  }

  /** Envía un código de 6 dígitos al paciente (o a su tutor si es menor). */
  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200)
  @AuditAction('SEND_OTP')
  @Post(':id/otp')
  sendOtp(@Param('id', ParseUUIDPipe) id: string) {
    return this.signing.sendOtp(id);
  }

  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200)
  @AuditAction('SIGN')
  @Post(':id/otp/verify')
  verifyOtp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.signing.verifyOtp(id, dto.code, dto.signerName, { ip: req.ip ?? null });
  }

  @HttpCode(200)
  @AuditAction('SIGN')
  @Post(':id/touch')
  touch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignTouchDto, @Req() req: Request) {
    return this.signing.signTouch(id, dto, { ip: req.ip ?? null });
  }
}
