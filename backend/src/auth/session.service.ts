import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config';
import { RedisService } from '../redis/redis.service';

/**
 * Sesiones con expiración deslizante en Redis (RNF-05: 15 min de inactividad).
 * Cada petición autenticada renueva el TTL; si la clave expira, la sesión murió.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  private key(sessionId: string): string {
    return `sess:${sessionId}`;
  }

  private get idleSeconds(): number {
    return this.config.env.SESSION_IDLE_SECONDS;
  }

  async create(sessionId: string, userId: string): Promise<void> {
    await this.redis.client.set(this.key(sessionId), userId, 'EX', this.idleSeconds);
  }

  /** Renueva la inactividad. Devuelve false si la sesión ya expiró. */
  async touch(sessionId: string): Promise<boolean> {
    return (await this.redis.client.expire(this.key(sessionId), this.idleSeconds)) === 1;
  }

  async exists(sessionId: string): Promise<boolean> {
    return (await this.redis.client.exists(this.key(sessionId))) === 1;
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.client.del(this.key(sessionId));
  }
}
