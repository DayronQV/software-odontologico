import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StockCountStatus, StockMovementType } from '@prisma/client';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { round3 } from './domain/stock-math';
import type { CountLineDto } from './dto/inventory.dto';
import { StockService } from './stock.service';

/** Toma de inventario físico y conciliación contra el sistema (la hace el Auditor). */
@Injectable()
export class CountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async list() {
    const [counts, locations] = await Promise.all([
      this.prisma.db.stockCount.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { lines: true } } } }),
      this.prisma.db.stockLocation.findMany(),
    ]);
    const names = new Map(locations.map((l) => [l.id, l.name]));
    return counts.map((c) => ({ id: c.id, status: c.status, location: names.get(c.locationId) ?? null, createdAt: c.createdAt, reconciledAt: c.reconciledAt, lines: c._count.lines }));
  }

  /** Abre una toma con una línea por insumo activo y la existencia que el sistema tiene hoy. */
  async create(locationId: string, user: AuthUser) {
    if (!(await this.prisma.db.stockLocation.findUnique({ where: { id: locationId } }))) throw new NotFoundException('Ubicación no encontrada');
    if (await this.prisma.db.stockCount.findFirst({ where: { locationId, status: StockCountStatus.OPEN } })) {
      throw new ConflictException('Ya hay una toma de inventario abierta en esta ubicación');
    }
    const [items, balances] = await Promise.all([this.stock.listItems(), this.stock.balances(this.prisma.db, { locationId })]);
    const created = await this.prisma.db.stockCount.create({
      data: { locationId, createdById: user.id, lines: { create: items.map((i) => ({ itemId: i.id, systemQty: balances.get(`${i.id}:${locationId}`) ?? 0 })) } },
    });
    return this.get(created.id);
  }

  async get(id: string) {
    const count = await this.prisma.db.stockCount.findUnique({ where: { id }, include: { lines: true } });
    if (!count) throw new NotFoundException('Toma de inventario no encontrada');
    const [items, location] = await Promise.all([this.stock.listItems(true), this.prisma.db.stockLocation.findUnique({ where: { id: count.locationId } })]);
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      id: count.id,
      status: count.status,
      location: location?.name ?? null,
      lines: count.lines
        .map((l) => ({ itemId: l.itemId, item: byId.get(l.itemId)?.name ?? l.itemId, unit: byId.get(l.itemId)?.unit ?? '', systemQty: Number(l.systemQty), countedQty: l.countedQty === null ? null : Number(l.countedQty) }))
        .sort((a, b) => a.item.localeCompare(b.item)),
    };
  }

  async setCounted(id: string, lines: CountLineDto[]) {
    const count = await this.open(id);
    const known = new Set((await this.prisma.db.stockCountLine.findMany({ where: { countId: count.id }, select: { itemId: true } })).map((l) => l.itemId));
    if (lines.some((l) => !known.has(l.itemId))) throw new BadRequestException('Algún insumo no pertenece a esta toma');
    await this.prisma.db.$transaction(lines.map((l) => this.prisma.db.stockCountLine.update({ where: { countId_itemId: { countId: id, itemId: l.itemId } }, data: { countedQty: l.countedQty } })));
    return this.get(id);
  }

  /** Genera un ajuste por cada diferencia contra la existencia ACTUAL del sistema y cierra la toma. */
  async reconcile(id: string, user: AuthUser) {
    const count = await this.open(id);
    const lines = await this.prisma.db.stockCountLine.findMany({ where: { countId: id, countedQty: { not: null } } });
    if (lines.length === 0) throw new BadRequestException('Registre al menos un conteo antes de conciliar');
    const items = new Map((await this.stock.listItems(true)).map((i) => [i.id, i]));
    let adjustments = 0;
    await this.prisma.db.$transaction(async (tx) => {
      const balances = await this.stock.balances(tx, { locationId: count.locationId });
      for (const line of lines) {
        const delta = round3(Number(line.countedQty) - (balances.get(`${line.itemId}:${count.locationId}`) ?? 0));
        if (delta === 0) continue;
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            locationId: count.locationId,
            type: StockMovementType.ADJUSTMENT,
            quantity: delta,
            unitCost: items.get(line.itemId)!.unitCost,
            reason: `Conciliación de inventario físico #${id.slice(0, 8)}`,
            createdById: user.id,
          },
        });
        adjustments++;
      }
      await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.RECONCILED, reconciledById: user.id, reconciledAt: new Date() } });
    });
    return { ...(await this.get(id)), adjustments };
  }

  private async open(id: string) {
    const count = await this.prisma.db.stockCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException('Toma de inventario no encontrada');
    if (count.status !== StockCountStatus.OPEN) throw new ConflictException('La toma ya fue conciliada');
    return count;
  }
}
