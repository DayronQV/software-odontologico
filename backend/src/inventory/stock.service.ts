import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, StockMovementType, SupplyRequestStatus } from '@prisma/client';
import { pageArgs, pageResult } from '../common/pagination/paginate';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/transaction';
import { isBelowMinimum, round3 } from './domain/stock-math';
import type { AdjustDto, EntryDto, ItemDto, KardexQueryDto, TransferDto } from './dto/inventory.dto';

type MovementDb = Pick<Tx, 'stockMovement'>;

/** Existencias por insumo y ubicación, y movimientos del kardex (inmutables). */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------------------------- insumos
  listItems(includeInactive = false) {
    return this.prisma.db.inventoryItem.findMany({ where: includeInactive ? {} : { active: true }, orderBy: { name: 'asc' } });
  }

  async saveItem(dto: ItemDto, id?: string) {
    const data = { code: dto.code, name: dto.name.trim(), unit: dto.unit.trim(), unitCost: dto.unitCost, minStock: dto.minStock, active: dto.active };
    if (!id) return this.prisma.db.inventoryItem.create({ data });
    await this.item(id);
    return this.prisma.db.inventoryItem.update({ where: { id }, data });
  }

  async item(id: string) {
    const item = await this.prisma.db.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Insumo no encontrado');
    return item;
  }

  // ------------------------------------------------------------------- existencias
  /** Suma de movimientos por insumo y ubicación. */
  async balances(db: MovementDb, where: Prisma.StockMovementWhereInput = {}): Promise<Map<string, number>> {
    const rows = await db.stockMovement.groupBy({ by: ['itemId', 'locationId'], where, _sum: { quantity: true } });
    return new Map(rows.map((r) => [`${r.itemId}:${r.locationId}`, round3(Number(r._sum.quantity ?? 0))]));
  }

  async available(db: MovementDb, itemId: string, locationId: string): Promise<number> {
    return (await this.balances(db, { itemId, locationId })).get(`${itemId}:${locationId}`) ?? 0;
  }

  /** Cantidades pedidas para citas vigentes (preparación de insumos) por insumo. */
  async reservedByItem(): Promise<Map<string, number>> {
    const rows = await this.prisma.db.supplyRequestLine.findMany({
      where: {
        request: {
          status: { in: [SupplyRequestStatus.REQUESTED, SupplyRequestStatus.PREPARED] },
          appointmentId: { in: (await this.prisma.db.appointment.findMany({ where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'WAITING_ROOM', 'IN_ATTENTION'] } }, select: { id: true } })).map((a) => a.id) },
        },
      },
    });
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.itemId, round3((map.get(row.itemId) ?? 0) + Number(row.quantity)));
    return map;
  }

  async overview(locationId?: string) {
    const [items, locations, balances, reserved] = await Promise.all([
      this.listItems(),
      this.prisma.db.stockLocation.findMany({ where: locationId ? { id: locationId } : {}, orderBy: { name: 'asc' } }),
      this.balances(this.prisma.db, locationId ? { locationId } : {}),
      this.reservedByItem(),
    ]);
    const rows = items.flatMap((item) =>
      locations.map((location) => {
        const quantity = balances.get(`${item.id}:${location.id}`) ?? 0;
        return {
          itemId: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          locationId: location.id,
          location: location.name,
          quantity,
          minStock: Number(item.minStock),
          unitCost: Number(item.unitCost),
          value: round3(quantity * Number(item.unitCost)),
          reserved: reserved.get(item.id) ?? 0,
          belowMinimum: isBelowMinimum(quantity, Number(item.minStock)),
        };
      }),
    );
    return rows.filter((r) => r.quantity !== 0 || !!locationId);
  }

  // ------------------------------------------------------------------ movimientos
  async entry(dto: EntryDto, user: AuthUser) {
    const item = await this.item(dto.itemId);
    await this.location(dto.locationId);
    return this.prisma.db.stockMovement.create({
      data: {
        itemId: dto.itemId,
        locationId: dto.locationId,
        type: StockMovementType.ENTRY,
        quantity: dto.quantity,
        unitCost: dto.unitCost ?? item.unitCost,
        supplier: dto.supplier?.trim() || null,
        lotCode: dto.lotCode?.trim() || null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: user.id,
      },
    });
  }

  /** Ajuste con motivo obligatorio. Nunca deja el stock en negativo. */
  async adjust(dto: AdjustDto, user: AuthUser) {
    if (dto.quantity === 0) throw new BadRequestException('La cantidad del ajuste no puede ser cero');
    const item = await this.item(dto.itemId);
    await this.location(dto.locationId);
    if (dto.quantity < 0 && (await this.available(this.prisma.db, dto.itemId, dto.locationId)) + dto.quantity < 0) {
      throw new ConflictException('El ajuste dejaría el stock en negativo');
    }
    return this.prisma.db.stockMovement.create({
      data: { itemId: dto.itemId, locationId: dto.locationId, type: StockMovementType.ADJUSTMENT, quantity: dto.quantity, unitCost: item.unitCost, reason: dto.reason.trim(), createdById: user.id },
    });
  }

  /** Traslado entre ubicaciones: dos movimientos enlazados, en una transacción. */
  async transfer(dto: TransferDto, user: AuthUser) {
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('El origen y el destino deben ser distintos');
    const item = await this.item(dto.itemId);
    await Promise.all([this.location(dto.fromLocationId), this.location(dto.toLocationId)]);
    const transferId = randomUUID();
    return this.prisma.db.$transaction(async (tx) => {
      if ((await this.available(tx, dto.itemId, dto.fromLocationId)) < dto.quantity) {
        throw new ConflictException('No hay stock suficiente en el origen');
      }
      const base = { itemId: dto.itemId, unitCost: item.unitCost, reason: dto.reason?.trim() || null, transferId, createdById: user.id };
      const out = await tx.stockMovement.create({ data: { ...base, locationId: dto.fromLocationId, type: StockMovementType.TRANSFER_OUT, quantity: -dto.quantity } });
      const into = await tx.stockMovement.create({ data: { ...base, locationId: dto.toLocationId, type: StockMovementType.TRANSFER_IN, quantity: dto.quantity } });
      return { transferId, out, in: into };
    });
  }

  async kardex(query: KardexQueryDto) {
    const args = pageArgs(query, 30);
    const where: Prisma.StockMovementWhereInput = { ...(query.itemId && { itemId: query.itemId }), ...(query.locationId && { locationId: query.locationId }) };
    const [total, rows] = await Promise.all([
      this.prisma.db.stockMovement.count({ where }),
      this.prisma.db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: args.skip,
        take: args.take,
        include: { item: { select: { code: true, name: true, unit: true } }, location: { select: { name: true } } },
      }),
    ]);
    const users = await this.prisma.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return pageResult(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        item: r.item,
        location: r.location.name,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
        supplier: r.supplier,
        lotCode: r.lotCode,
        expiresAt: r.expiresAt,
        reason: r.reason,
        procedureRecordId: r.procedureRecordId,
        by: names.get(r.createdById) ?? null,
      })),
      total,
      args,
    );
  }

  private async location(id: string) {
    const location = await this.prisma.db.stockLocation.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Ubicación de stock no encontrada');
    return location;
  }
}
