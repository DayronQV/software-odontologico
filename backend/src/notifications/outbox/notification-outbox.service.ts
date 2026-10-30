import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ContactChannel, NotificationKind, NotificationStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../../queue/queue.module';

export interface NotificationJobData {
  logId: string;
}

export interface EnqueueRequest {
  appointmentId: string;
  channel: ContactChannel;
  kind: NotificationKind;
  leadHours?: number;
  runAt: Date;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 2_000;

export const jobIdFor = (logId: string) => `notif-${logId}`;

/**
 * Bandeja de salida: cada mensaje queda registrado en NotificationLog y programado en BullMQ
 * (con espera hasta su hora, reintentos exponenciales y cancelación si la cita cambia).
 */
@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJobData>,
  ) {}

  async enqueue(request: EnqueueRequest): Promise<string> {
    const log = await this.prisma.db.notificationLog.create({
      data: {
        appointmentId: request.appointmentId,
        channel: request.channel,
        kind: request.kind,
        leadHours: request.leadHours,
        scheduledFor: request.runAt,
      },
    });
    await this.queue.add(
      'send',
      { logId: log.id },
      {
        jobId: jobIdFor(log.id),
        delay: Math.max(0, request.runAt.getTime() - Date.now()),
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    return log.id;
  }

  /** Cancela los mensajes aún pendientes de una cita (reprogramada, cancelada o atendida). */
  async cancelPending(appointmentId: string): Promise<number> {
    const pending = await this.prisma.db.notificationLog.findMany({
      where: { appointmentId, status: NotificationStatus.PENDING },
      select: { id: true },
    });
    for (const { id } of pending) {
      try {
        await this.queue.remove(jobIdFor(id));
      } catch (error) {
        // Un job ya en ejecución no se puede quitar: el worker revisa el estado del registro.
        this.logger.debug(`No se pudo quitar el job ${id}: ${(error as Error).message}`);
      }
    }
    if (pending.length > 0) {
      await this.prisma.db.notificationLog.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.CANCELED },
      });
    }
    return pending.length;
  }
}
