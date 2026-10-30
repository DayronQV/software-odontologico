import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { SettingsService } from '../../catalog/settings/settings.service';
import { formatLocalTime } from '../../common/local-time';
import { PrismaService } from '../../prisma/prisma.service';
import { RELEASED_STATUSES } from '../domain/appointment-state-machine';
import { fitsWorkingHours } from '../domain/scheduling-rules';

export interface SlotRequest {
  patientId: string;
  professionalId: string;
  chairId: string;
  startAt: Date;
  endAt: Date;
  /** Al reprogramar, la propia cita no cuenta como conflicto. */
  ignoreAppointmentId?: string;
}

const MIN_DURATION_MS = 5 * 60_000;
const MAX_DURATION_MS = 8 * 60 * 60_000;
const PAST_TOLERANCE_MS = 5 * 60_000;

/**
 * Valida que un horario se pueda agendar. RN-03: el mismo sillón no puede tener dos citas a la
 * vez, aunque cambie el odontólogo. La restricción de PostgreSQL es la última barrera (carreras);
 * aquí se ofrece un mensaje claro de qué recurso está ocupado.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async assertAvailable(request: SlotRequest): Promise<void> {
    const { startAt, endAt } = request;
    const clinic = await this.settings.get();

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw new BadRequestException('El rango de la cita no es válido');
    }
    const duration = endAt.getTime() - startAt.getTime();
    if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
      throw new BadRequestException('La duración de la cita debe estar entre 5 minutos y 8 horas');
    }
    if (startAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
      throw new BadRequestException('No se puede agendar en el pasado');
    }

    const [chair, professional, patient] = await Promise.all([
      this.prisma.db.chair.findUnique({
        where: { id: request.chairId },
        include: { office: { select: { active: true } } },
      }),
      this.prisma.db.professional.findUnique({
        where: { id: request.professionalId },
        include: { schedules: true },
      }),
      this.prisma.db.patient.findUnique({ where: { id: request.patientId } }),
    ]);
    if (!chair?.active || !chair.office.active) {
      throw new BadRequestException('El sillón no existe o está desactivado');
    }
    if (!professional?.active) {
      throw new BadRequestException('El profesional no existe o está desactivado');
    }
    if (!patient?.active) {
      throw new BadRequestException('El paciente no existe o está desactivado');
    }

    const hours = fitsWorkingHours(startAt, endAt, clinic.timezone, professional.schedules, clinic);
    if (!hours.ok) throw new BadRequestException(hours.reason);

    const conflicts = await this.prisma.db.appointment.findMany({
      where: {
        status: { notIn: RELEASED_STATUSES },
        ...(request.ignoreAppointmentId && { id: { not: request.ignoreAppointmentId } }),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        OR: [
          { chairId: request.chairId },
          { professionalId: request.professionalId },
          { patientId: request.patientId },
        ],
      },
      select: { chairId: true, professionalId: true, patientId: true, startAt: true, endAt: true },
    });

    const range = (c: { startAt: Date; endAt: Date }) =>
      `de ${formatLocalTime(c.startAt, clinic.timezone)} a ${formatLocalTime(c.endAt, clinic.timezone)}`;
    const onChair = conflicts.find((c) => c.chairId === request.chairId);
    if (onChair) {
      throw new ConflictException(`El sillón "${chair.name}" ya tiene una cita ${range(onChair)}`);
    }
    const onProfessional = conflicts.find((c) => c.professionalId === request.professionalId);
    if (onProfessional) {
      throw new ConflictException(`El profesional ya tiene una cita ${range(onProfessional)}`);
    }
    const onPatient = conflicts.find((c) => c.patientId === request.patientId);
    if (onPatient) {
      throw new ConflictException(`El paciente ya tiene una cita ${range(onPatient)}`);
    }
  }
}
