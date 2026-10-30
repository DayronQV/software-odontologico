import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/transaction';

type Db = Pick<Tx, 'stockLocation' | 'office' | 'professional'>;

/** Ubicaciones de stock: una por consultorio y una por profesional (se crean cuando hacen falta). */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOffice(officeId: string, db: Db = this.prisma.db) {
    const found = await db.stockLocation.findUnique({ where: { officeId } });
    if (found) return found;
    const office = await db.office.findUniqueOrThrow({ where: { id: officeId } });
    return db.stockLocation.upsert({
      where: { officeId },
      update: {},
      create: { officeId, name: `Consultorio: ${office.name}` },
    });
  }

  async forProfessional(professionalId: string, db: Db = this.prisma.db) {
    const found = await db.stockLocation.findUnique({ where: { professionalId } });
    if (found) return found;
    const professional = await db.professional.findUniqueOrThrow({
      where: { id: professionalId },
      include: { user: { select: { fullName: true } } },
    });
    return db.stockLocation.upsert({
      where: { professionalId },
      update: {},
      create: { professionalId, name: `Profesional: ${professional.user.fullName}` },
    });
  }

  /** Todas las ubicaciones, creando las que falten para cada consultorio y profesional activos. */
  async list() {
    const [offices, professionals] = await Promise.all([
      this.prisma.db.office.findMany({ where: { active: true }, select: { id: true } }),
      this.prisma.db.professional.findMany({ where: { active: true }, select: { id: true } }),
    ]);
    for (const office of offices) await this.forOffice(office.id);
    for (const professional of professionals) await this.forProfessional(professional.id);
    return this.prisma.db.stockLocation.findMany({ orderBy: { name: 'asc' } });
  }
}
