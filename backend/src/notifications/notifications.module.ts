import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationDeliveryService } from './delivery/notification-delivery.service';
import { NotificationProcessor } from './delivery/notification.processor';
import { NotificationHistoryService } from './history/notification-history.service';
import { NotificationsController } from './history/notifications.controller';
import { NotificationOutboxService } from './outbox/notification-outbox.service';
import { RemindersService } from './reminders/reminders.service';

/** Confirmaciones y recordatorios automáticos de citas por WhatsApp, SMS y correo (RF-11). */
@Module({
  imports: [QueueModule, IntegrationsModule, CatalogModule],
  controllers: [NotificationsController],
  providers: [
    NotificationOutboxService,
    NotificationDeliveryService,
    NotificationProcessor,
    NotificationHistoryService,
    RemindersService,
  ],
  exports: [RemindersService],
})
export class NotificationsModule {}
