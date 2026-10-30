import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config';
import { parseRedisUrl } from './redis-connection';

/** Cola de recordatorios (RF-11). En la Fase 0 solo se registra; los jobs llegan en la Fase 1. */
export const NOTIFICATIONS_QUEUE = 'notifications';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: parseRedisUrl(config.env.REDIS_URL),
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
