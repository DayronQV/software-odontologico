import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionService,
    PasswordService,
    MfaService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, TokenService, SessionService, PasswordService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
