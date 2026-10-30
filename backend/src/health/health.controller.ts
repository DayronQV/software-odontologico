import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Estado de la base de datos y de Redis (healthcheck para Docker y monitoreo del SLA). */
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const db = await this.prisma.db.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const redis = await this.redis.client.ping().then(
      (r) => (r === 'PONG' ? ('up' as const) : ('down' as const)),
      () => 'down' as const,
    );
    const status = db === 'up' && redis === 'up' ? 'ok' : 'error';
    if (status === 'error') throw new ServiceUnavailableException({ status, db, redis });
    return { status, db, redis, timestamp: new Date().toISOString() };
  }
}
