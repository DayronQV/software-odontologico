import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourceUsageService } from '../shared/resource-usage.service';
import type { CreateChairDto, UpdateChairDto } from './dto/chair.dto';

@Injectable()
export class ChairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: ResourceUsageService,
  ) {}

  async create(dto: CreateChairDto) {
    const office = await this.prisma.db.office.findUnique({ where: { id: dto.officeId } });
    if (!office) throw new NotFoundException('Consultorio no encontrado');
    if (!office.active) throw new ConflictException('El consultorio está desactivado');
    return this.prisma.db.chair.create({
      data: { officeId: dto.officeId, name: dto.name.trim() },
    });
  }

  async update(id: string, dto: UpdateChairDto) {
    if (dto.active === false) {
      await this.usage.assertNoUpcomingAppointments({ chairId: id }, 'el sillón');
    }
    return this.prisma.db.chair.update({
      where: { id },
      data: { name: dto.name?.trim(), active: dto.active },
    });
  }
}
