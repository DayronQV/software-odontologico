import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RecipeLineDto } from './dto/inventory.dto';

/** Receta estándar de consumo por procedimiento del catálogo (RF-14). */
@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos los procedimientos activos con las líneas de su receta. */
  async list() {
    const procedures = await this.prisma.db.procedure.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, recipes: { select: { itemId: true, quantity: true, item: { select: { name: true, unit: true } } } } },
    });
    return procedures.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      lines: p.recipes.map((r) => ({ itemId: r.itemId, item: r.item.name, unit: r.item.unit, quantity: Number(r.quantity) })),
    }));
  }

  async replace(procedureId: string, lines: RecipeLineDto[]) {
    if (!(await this.prisma.db.procedure.findUnique({ where: { id: procedureId }, select: { id: true } }))) {
      throw new NotFoundException('Procedimiento no encontrado');
    }
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) throw new BadRequestException('Un insumo no puede repetirse en la receta');
    const items = await this.prisma.db.inventoryItem.count({ where: { id: { in: lines.map((l) => l.itemId) }, active: true } });
    if (items !== lines.length) throw new BadRequestException('Algún insumo no existe o está desactivado');
    await this.prisma.db.$transaction([
      this.prisma.db.consumptionRecipe.deleteMany({ where: { procedureId } }),
      this.prisma.db.consumptionRecipe.createMany({ data: lines.map((l) => ({ procedureId, itemId: l.itemId, quantity: l.quantity })) }),
    ]);
    return (await this.list()).find((p) => p.id === procedureId);
  }
}
