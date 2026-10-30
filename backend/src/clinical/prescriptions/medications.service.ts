import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MedicationDto } from './dto/prescription.dto';

/** Catálogo básico de medicamentos; el administrador lo mantiene. */
@Injectable()
export class MedicationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(activeOnly = true) {
    return this.prisma.db.medication.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { name: 'asc' },
    });
  }

  create(dto: MedicationDto) {
    return this.prisma.db.medication.create({ data: this.clean(dto) });
  }

  async update(id: string, dto: MedicationDto) {
    const current = await this.prisma.db.medication.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Medicamento no encontrado');
    return this.prisma.db.medication.update({ where: { id }, data: this.clean(dto) });
  }

  private clean(dto: MedicationDto) {
    return {
      name: dto.name.trim(),
      activeIngredient: dto.activeIngredient.trim(),
      presentation: dto.presentation.trim(),
      allergyGroups: [...new Set(dto.allergyGroups.map((g) => g.trim().toLowerCase()).filter(Boolean))],
      active: dto.active,
    };
  }
}
