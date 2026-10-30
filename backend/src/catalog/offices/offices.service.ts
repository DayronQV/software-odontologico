import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { ResourceUsageService } from '../shared/resource-usage.service';
import type { CreateOfficeDto, UpdateOfficeDto } from './dto/office.dto';

@Injectable()
export class OfficesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: ResourceUsageService,
  ) {}

  async list(query: CatalogQueryDto) {
    const args = pageArgs(query, 50);
    const where: Prisma.OfficeWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
    };
    const [total, items] = await Promise.all([
      this.prisma.db.office.count({ where }),
      this.prisma.db.office.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: args.skip,
        take: args.take,
        include: { chairs: { orderBy: { name: 'asc' } } },
      }),
    ]);
    return pageResult(items, total, args);
  }

  create(dto: CreateOfficeDto) {
    return this.prisma.db.office.create({
      data: { name: dto.name.trim(), address: dto.address?.trim() },
      include: { chairs: true },
    });
  }

  async update(id: string, dto: UpdateOfficeDto) {
    if (dto.active === false) {
      await this.usage.assertNoUpcomingAppointments({ chair: { officeId: id } }, 'el consultorio');
    }
    return this.prisma.db.office.update({
      where: { id },
      data: { name: dto.name?.trim(), address: dto.address?.trim(), active: dto.active },
      include: { chairs: { orderBy: { name: 'asc' } } },
    });
  }
}
