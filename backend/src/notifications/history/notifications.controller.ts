import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntity, Roles } from '../../common/decorators';
import { PATIENT_STAFF } from '../../common/role-groups';
import { NotificationHistoryService } from './notification-history.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(...PATIENT_STAFF)
@AuditEntity('NotificationLog')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly history: NotificationHistoryService) {}

  /** Historial de notificaciones de una cita. */
  @Get('appointments/:appointmentId')
  byAppointment(@Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.history.byAppointment(appointmentId);
  }
}
