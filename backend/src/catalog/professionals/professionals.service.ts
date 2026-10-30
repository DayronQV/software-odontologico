import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { ResourceUsageService } from '../shared/resource-usage.service';
import type {
  CreateProfessionalDto,
  ScheduleSlotDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';
import { validateScheduleSlots } from './schedule.rules';

const INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  schedules: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
} satisfies Prisma.ProfessionalInclude;

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: ResourceUsageService,
  ) {}

  async list(query: CatalogQueryDto) {
    const args = pageArgs(query, 50);
    const where: Prisma.ProfessionalWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
          { specialty: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.db.professional.count({ where }),
      this.prisma.db.professional.findMany({
        where,
        include: INCLUDE,
        orderBy: { user: { fullName: 'asc' } },
        skip: args.skip,
        take: args.take,
      }),
    ]);
    return pageResult(items, total, args);
  }

  /** El profesional vinculado al usuario autenticado. */
  async findByUserId(userId: string) {
    const professional = await this.prisma.db.professional.findUnique({
      where: { userId },
      include: INCLUDE,
    });
    if (!professional) throw new NotFoundException('Su usuario no está registrado como profesional');
    return professional;
  }

  async create(dto: CreateProfessionalDto) {
    const user = await this.prisma.db.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role !== Role.ODONTOLOGO) {
      throw new BadRequestException('El usuario debe tener el perfil Odontólogo');
    }
    if (await this.prisma.db.professional.findUnique({ where: { userId: dto.userId } })) {
      throw new ConflictException('Ese usuario ya está registrado como profesional');
    }
    const slots = dto.schedule ?? [];
    this.assertValidSchedule(slots);

    return this.prisma.db.professional.create({
      data: {
        userId: dto.userId,
        kind: dto.kind,
        specialty: dto.specialty?.trim(),
        licenseNumber: dto.licenseNumber?.trim(),
        schedules: { create: slots },
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProfessionalDto) {
    if (dto.active === false) {
      await this.usage.assertNoUpcomingAppointments({ professionalId: id }, 'al profesional');
    }
    return this.prisma.db.professional.update({
      where: { id },
      data: {
        kind: dto.kind,
        specialty: dto.specialty?.trim(),
        licenseNumber: dto.licenseNumber?.trim(),
        active: dto.active,
      },
      include: INCLUDE,
    });
  }

  /** Reemplaza todo el horario semanal del profesional. */
  async replaceSchedule(id: string, slots: ScheduleSlotDto[]) {
    this.assertValidSchedule(slots);
    await this.prisma.db.$transaction([
      this.prisma.db.professionalSchedule.deleteMany({ where: { professionalId: id } }),
      this.prisma.db.professionalSchedule.createMany({
        data: slots.map((slot) => ({ ...slot, professionalId: id })),
      }),
    ]);
    return this.prisma.db.professional.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  private assertValidSchedule(slots: ScheduleSlotDto[]): void {
    const error = validateScheduleSlots(slots);
    if (error) throw new BadRequestException(error);
  }
}
