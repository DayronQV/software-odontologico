import { Injectable } from '@nestjs/common';
import { SettingsService } from '../catalog/settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { expiryState, isBelowMinimum } from './domain/stock-math';
import { StockService } from './stock.service';

/** Alertas de inventario: stock mínimo, vencimientos próximos y descargos con stock insuficiente. */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly settings: SettingsService,
  ) {}

  async list() {
    const [items, locations, balances, clinic] = await Promise.all([
      this.stock.listItems(),
      this.prisma.db.stockLocation.findMany(),
      this.stock.balances(this.prisma.db),
      this.settings.get(),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const locationName = new Map(locations.map((l) => [l.id, l.name]));

    // Bajo mínimo: cada ubicación con existencias del insumo, o el insumo sin ninguna existencia.
    const low = [] as Array<{ itemId: string; item: string; unit: string; location: string | null; quantity: number; minStock: number }>;
    for (const item of items) {
      const minStock = Number(item.minStock);
      if (minStock <= 0) continue;
      const rows = [...balances].filter(([key]) => key.startsWith(`${item.id}:`));
      if (rows.length === 0) low.push({ itemId: item.id, item: item.name, unit: item.unit, location: null, quantity: 0, minStock });
      for (const [key, quantity] of rows) {
        if (isBelowMinimum(quantity, minStock)) {
          low.push({ itemId: item.id, item: item.name, unit: item.unit, location: locationName.get(key.split(':')[1]) ?? null, quantity, minStock });
        }
      }
    }

    // Vencimientos: lotes de entrada con fecha, mientras la ubicación todavía tenga existencias del insumo.
    const horizon = new Date(Date.now() + clinic.expiryAlertDays * 86_400_000);
    const lots = await this.prisma.db.stockMovement.findMany({
      where: { type: 'ENTRY', expiresAt: { not: null, lte: horizon } },
      orderBy: { expiresAt: 'asc' },
    });
    const today = new Date();
    const expiring = lots
      .filter((lot) => (balances.get(`${lot.itemId}:${lot.locationId}`) ?? 0) > 0 && itemById.has(lot.itemId))
      .map((lot) => ({
        itemId: lot.itemId,
        item: itemById.get(lot.itemId)!.name,
        location: locationName.get(lot.locationId) ?? null,
        lotCode: lot.lotCode,
        expiresAt: lot.expiresAt!,
        state: expiryState(lot.expiresAt!, today, clinic.expiryAlertDays),
      }));

    const exceptions = await this.prisma.db.stockException.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      low,
      expiring,
      exceptions: exceptions.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        item: itemById.get(e.itemId)?.name ?? e.itemId,
        location: locationName.get(e.locationId) ?? null,
        missing: Number(e.missing),
        procedureRecordId: e.procedureRecordId,
      })),
    };
  }
}
