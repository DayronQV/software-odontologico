import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AppointmentEventsPublisher } from './appointments/appointment-events.publisher';
import { AppointmentStatusService } from './appointments/appointment-status.service';
import { AppointmentsController } from './appointments/appointments.controller';
import { AppointmentsQueryService } from './appointments/appointments-query.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AvailabilityService } from './appointments/availability.service';

/** Agenda: citas por sillón/profesional, estados y tiempo real. */
@Module({
  imports: [CatalogModule, NotificationsModule, RealtimeModule],
  controllers: [AppointmentsController],
  providers: [
    AvailabilityService,
    AppointmentsQueryService,
    AppointmentsService,
    AppointmentStatusService,
    AppointmentEventsPublisher,
  ],
})
export class AgendaModule {}
