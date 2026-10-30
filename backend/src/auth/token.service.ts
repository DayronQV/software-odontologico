import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { AppConfigService } from '../config/app-config';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  /** Id de sesión (clave de inactividad en Redis). */
  sid: string;
  /** true solo después de validar el segundo factor. */
  mfa: boolean;
  iat?: number;
  exp?: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  signAccess(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      algorithm: 'HS256',
      expiresIn: this.accessTtlSeconds,
    });
  }

  verifyAccess(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
    });
  }
}
