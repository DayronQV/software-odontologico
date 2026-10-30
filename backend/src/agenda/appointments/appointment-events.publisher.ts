import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EventsGateway } from '../../realtime/events.gateway';
import type { AppointmentView } from './appointment-view.mapper';

export type AgendaEvent = 'created' | 'updated' | 'status';

/** Quién necesita ver los cambios de la agenda en tiempo real (calendario y sala de espera). */
const AUDIENCE: Role[] = [Role.RECEPCIONISTA, Role.ODONTOLOGO, Role.ASISTENTE];

/**
 * Publica por WebSocket los cambios de citas. Solo viaja lo mínimo (ids y estado): cada cliente
 * vuelve a pedir la cita por la API, donde se aplican los permisos.
 */
@Injectable()
export class AppointmentEventsPublisher {
  private readonly logger = new Logger(AppointmentEventsPublisher.name);

  constructor(private readonly gateway: EventsGateway) {}

  publish(event: AgendaEvent, appointment: AppointmentView): void {
    const payload = {
      id: appointment.id,
      status: appointment.status,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      chairId: appointment.chair.id,
      professionalId: appointment.professional.id,
    };
    try {
      for (const role of AUDIENCE) this.gateway.emitToRole(role, `agenda:appointment.${event}`, payload);
    } catch (error) {
      // Un fallo de tiempo real nunca debe romper la operación de negocio.
      this.logger.warn(`No se pudo publicar el evento ${event}: ${(error as Error).message}`);
    }
  }
}
