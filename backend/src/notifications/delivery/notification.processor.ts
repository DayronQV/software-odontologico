import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../../queue/queue.module';
import type { NotificationJobData } from '../outbox/notification-outbox.service';
import { NotificationDeliveryService } from './notification-delivery.service';

/** Worker de la cola de notificaciones: toma cada job cuando llega su hora y lo envía. */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  constructor(private readonly delivery: NotificationDeliveryService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    await this.delivery.deliver(job.data.logId, job.attemptsMade + 1 >= maxAttempts);
  }
}
