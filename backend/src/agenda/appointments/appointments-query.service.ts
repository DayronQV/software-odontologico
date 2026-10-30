import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, Role } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { localParts } from '../../common/local-time';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APPOINTMENT_INCLUDE,
  toAppointmentView,
  type AppointmentView,
} from './appointment-view.mapper';
import type { AppointmentQueryDto } from './dto/appointment.dto';

const DAY_MS = 24 * 60 * 60_000;
const MAX_RANGE_DAYS = 62;

@Injectable()
export class AppointmentsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Citas de un rango (por defecto, la semana que empieza hoy), con filtros opcionales. */
  async list(query: AppointmentQueryDto, user: AuthUser): Promise<AppointmentView[]> {
    const from = query.from ? new Date(query.from) : await this.startOfToday();
    const to = query.to ? new Date(query.to) : new Date(from.getTime() + 7 * DAY_MS);
    if (to <= from) throw new BadRequestException('El rango de fechas no es válido');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }

    const professionalScope = await this.professionalScope(user);
    const where: Prisma.AppointmentWhereInput = {
      startAt: { gte: from, lt: to },
      ...(query.status && { status: query.status }),
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.chairId && { chairId: query.chairId }),
      ...(query.officeId && { chair: { officeId: query.officeId } }),
      // El odontólogo solo ve su propia agenda, aunque pida otra
      professionalId: professionalScope ?? query.professionalId,
    };
    const appointments = await this.prisma.db.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { startAt: 'asc' },
    });
    return appointments.map((a) => toAppointmentView(a, user.role));
  }

  async findOne(id: string, user: AuthUser): Promise<AppointmentView> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    this.assertVisible(appointment.professional.userId, user);
    return toAppointmentView(appointment, user.role);
  }

  /** Pacientes en sala de espera o en atención hoy, por orden de llegada. */
  async waitingRoom(user: AuthUser) {
    const from = await this.startOfToday();
    const professionalScope = await this.professionalScope(user);
    const appointments = await this.prisma.db.appointment.findMany({
      where: {
        startAt: { gte: from, lt: new Date(from.getTime() + DAY_MS) },
        status: { in: [AppointmentStatus.WAITING_ROOM, AppointmentStatus.IN_ATTENTION] },
        professionalId: professionalScope,
      },
      include: {
        ...APPOINTMENT_INCLUDE,
        statusLogs: {
          where: { toStatus: AppointmentStatus.WAITING_ROOM },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    return appointments
      .map(({ statusLogs, ...appointment }) => ({
        ...toAppointmentView(appointment, user.role),
        waitingSince: statusLogs[0]?.createdAt ?? appointment.startAt,
      }))
      .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
  }

  /** Bitácora de estados: quién y cuándo (RF-10). */
  async history(id: string, user: AuthUser) {
    await this.findOne(id, user);
    const logs = await this.prisma.db.appointmentStatusLog.findMany({
      where: { appointmentId: id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { fullName: true, role: true } } },
    });
    return logs.map((log) => ({
      id: log.id,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      note: log.note,
      createdAt: log.createdAt,
      user: log.user,
    }));
  }

  /** Para odontólogos devuelve su id de profesional; para el resto, undefined (sin restricción). */
  private async professionalScope(user: AuthUser): Promise<string | undefined> {
    if (user.role !== Role.ODONTOLOGO) return undefined;
    const own = await this.prisma.db.professional.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return own?.id ?? '00000000-0000-0000-0000-000000000000'; // sin perfil profesional: no ve nada
  }

  private assertVisible(professionalUserId: string, user: AuthUser): void {
    if (user.role === Role.ODONTOLOGO && professionalUserId !== user.id) {
      throw new ForbiddenException('Solo puede ver las citas de su propia agenda');
    }
  }

  /** Comienzo del día actual en la zona horaria de la clínica. */
  private async startOfToday(): Promise<Date> {
    const { timezone } = await this.settings.get();
    const now = new Date();
    const { minuteOfDay } = localParts(now, timezone);
    const startOfMinute = now.getTime() - (now.getTime() % 60_000);
    return new Date(startOfMinute - minuteOfDay * 60_000);
  }
}
