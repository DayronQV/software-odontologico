import { ConflictException, Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_STATUSES = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.WAITING_ROOM,
  AppointmentStatus.IN_ATTENTION,
];

/** Impide desactivar un recurso (sillón, consultorio, profesional) que tiene citas por atender. */
@Injectable()
export class ResourceUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNoUpcomingAppointments(
    where: Prisma.AppointmentWhereInput,
    resourceLabel: string,
  ): Promise<void> {
    const count = await this.prisma.db.appointment.count({
      where: { ...where, status: { in: ACTIVE_STATUSES }, endAt: { gte: new Date() } },
    });
    if (count > 0) {
      throw new ConflictException(
        `No se puede desactivar ${resourceLabel}: tiene ${count} cita(s) pendiente(s). Reprográmelas o cancélelas primero.`,
      );
    }
  }
}
