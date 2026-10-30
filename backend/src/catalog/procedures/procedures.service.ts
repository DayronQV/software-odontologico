import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateProcedureDto,
  ProcedureQueryDto,
  UpdateProcedureDto,
} from './dto/procedure.dto';

@Injectable()
export class ProceduresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProcedureQueryDto) {
    const args = pageArgs(query, 25);
    const where: Prisma.ProcedureWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.category && { category: query.category }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { code: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.db.procedure.count({ where }),
      this.prisma.db.procedure.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: args.skip,
        take: args.take,
      }),
    ]);
    return pageResult(items, total, args);
  }

  /** Categorías existentes (para el filtro de la pantalla). */
  async categories(): Promise<string[]> {
    const rows = await this.prisma.db.procedure.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  create(dto: CreateProcedureDto) {
    return this.prisma.db.procedure.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        category: dto.category.trim(),
        durationMinutes: dto.durationMinutes,
        basePrice: dto.basePrice,
        labCost: dto.labCost ?? 0,
        requiresConsent: dto.requiresConsent ?? false,
      },
    });
  }

  update(id: string, dto: UpdateProcedureDto) {
    return this.prisma.db.procedure.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name?.trim(),
        category: dto.category?.trim(),
        durationMinutes: dto.durationMinutes,
        basePrice: dto.basePrice,
        labCost: dto.labCost,
        requiresConsent: dto.requiresConsent,
        active: dto.active,
      },
    });
  }
}
