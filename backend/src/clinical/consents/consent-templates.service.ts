import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateConsentTemplateDto } from './dto/consent.dto';

/** Plantillas de consentimiento por procedimiento, versionadas: editar crea una versión nueva. */
@Injectable()
export class ConsentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(procedureId?: string) {
    return this.prisma.db.consentTemplate.findMany({
      where: { ...(procedureId && { procedureId }), active: true },
      orderBy: [{ procedureId: 'asc' }, { version: 'desc' }],
      include: { procedure: { select: { code: true, name: true } } },
    });
  }

  async create(dto: CreateConsentTemplateDto, user: AuthUser) {
    const procedure = await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } });
    if (!procedure) throw new NotFoundException('Procedimiento no encontrado');

    return this.prisma.db.$transaction(async (tx) => {
      const latest = await tx.consentTemplate.findFirst({
        where: { procedureId: dto.procedureId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await tx.consentTemplate.updateMany({
        where: { procedureId: dto.procedureId, active: true },
        data: { active: false },
      });
      return tx.consentTemplate.create({
        data: {
          procedureId: dto.procedureId,
          version: (latest?.version ?? 0) + 1,
          title: dto.title.trim(),
          body: dto.body.trim(),
          createdById: user.id,
        },
        include: { procedure: { select: { code: true, name: true } } },
      });
    });
  }

  /** Versión vigente de un procedimiento, o `null` si todavía no tiene plantilla. */
  findActive(procedureId: string) {
    return this.prisma.db.consentTemplate.findFirst({
      where: { procedureId, active: true },
      orderBy: { version: 'desc' },
    });
  }
}
