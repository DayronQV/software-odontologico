import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import type { CreateInsurerDto, UpdateInsurerDto } from './dto/insurer.dto';

@Injectable()
export class InsurersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CatalogQueryDto) {
    const args = pageArgs(query, 50);
    const where: Prisma.InsurerWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
    };
    const [total, items] = await Promise.all([
      this.prisma.db.insurer.count({ where }),
      this.prisma.db.insurer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: args.skip,
        take: args.take,
      }),
    ]);
    return pageResult(items, total, args);
  }

  create(dto: CreateInsurerDto) {
    return this.prisma.db.insurer.create({ data: { name: dto.name.trim() } });
  }

  update(id: string, dto: UpdateInsurerDto) {
    return this.prisma.db.insurer.update({
      where: { id },
      data: { name: dto.name?.trim(), active: dto.active },
    });
  }
}
