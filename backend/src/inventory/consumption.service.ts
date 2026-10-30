import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementType, StockPolicy } from '@prisma/client';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/transaction';
import { allocateConsumption, round3 } from './domain/stock-math';
import { LocationsService } from './locations.service';
import { StockService } from './stock.service';

export interface ConsumedProcedure {
  id: string;
  procedureId: string;
  performedById: string;
  appointmentId: string | null;
}

/** Descargo automático de insumos según la receta de consumo (RF-14) y sus correcciones. */
@Injectable()
export class ConsumptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Descuenta los insumos de la receta del procedimiento. Corre DENTRO de la transacción que registra el
   * procedimiento: o se registra y se descarga, o no pasa nada. Es idempotente: si ya hay descargo para
   * este procedimiento no hace nada. Prioridad de ubicación: profesional y luego consultorio.
   */
  async consume(tx: Tx, record: ConsumedProcedure): Promise<number> {
    const recipe = await tx.consumptionRecipe.findMany({ where: { procedureId: record.procedureId }, include: { item: true } });
    if (recipe.length === 0) return 0;
    if ((await tx.stockMovement.count({ where: { procedureRecordId: record.id, type: StockMovementType.CONSUMPTION } })) > 0) return 0;

    const sources = await this.sourceLocations(tx, record);
    if (sources.length === 0) return 0; // sin consultorio ni profesional: no hay de dónde descontar
    const { stockPolicy } = await tx.clinicSettings.findUniqueOrThrow({ where: { id: 1 } });
    const balances = await this.stock.balances(tx, { locationId: { in: sources.map((s) => s.id) }, itemId: { in: recipe.map((r) => r.itemId) } });

    let movements = 0;
    for (const line of recipe) {
      const needed = Number(line.quantity);
      const { allocations, shortage } = allocateConsumption(
        needed,
        sources.map((s) => ({ locationId: s.id, available: balances.get(`${line.itemId}:${s.id}`) ?? 0 })),
      );
      if (shortage > 0) {
        if (stockPolicy === StockPolicy.BLOCK) {
          throw new ConflictException(`Stock insuficiente de «${line.item.name}»: faltan ${shortage} ${line.item.unit}`);
        }
        // «Permitir con alerta»: el faltante se descuenta igual (queda en negativo) y se registra la excepción.
        const target = allocations[0]?.locationId ?? sources[0].id;
        const existing = allocations.find((a) => a.locationId === target);
        if (existing) existing.quantity = round3(existing.quantity + shortage);
        else allocations.push({ locationId: target, quantity: shortage });
        await tx.stockException.create({ data: { itemId: line.itemId, locationId: target, procedureRecordId: record.id, missing: shortage } });
      }
      for (const allocation of allocations) {
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            locationId: allocation.locationId,
            type: StockMovementType.CONSUMPTION,
            quantity: -allocation.quantity,
            unitCost: line.item.unitCost,
            procedureRecordId: record.id,
            reason: 'Descargo automático por receta de consumo',
            createdById: record.performedById,
          },
        });
        movements++;
      }
    }
    return movements;
  }

  /** Anula el descargo de un procedimiento: devuelve el stock con movimientos de reversión (el original se conserva). */
  async reverse(recordId: string, reason: string, user: AuthUser) {
    const consumed = await this.prisma.db.stockMovement.findMany({ where: { procedureRecordId: recordId, type: StockMovementType.CONSUMPTION } });
    if (consumed.length === 0) throw new NotFoundException('Este procedimiento no tiene descargo de insumos');
    const reversed = await this.prisma.db.stockMovement.findMany({ where: { reversalOfId: { in: consumed.map((m) => m.id) } }, select: { reversalOfId: true } });
    const done = new Set(reversed.map((r) => r.reversalOfId));
    const pending = consumed.filter((m) => !done.has(m.id));
    if (pending.length === 0) throw new ConflictException('El descargo ya fue revertido');
    await this.prisma.db.$transaction(
      pending.map((m) =>
        this.prisma.db.stockMovement.create({
          data: {
            itemId: m.itemId,
            locationId: m.locationId,
            type: StockMovementType.REVERSAL,
            quantity: -m.quantity,
            unitCost: m.unitCost,
            procedureRecordId: recordId,
            reversalOfId: m.id,
            reason: reason.trim(),
            createdById: user.id,
          },
        }),
      ),
    );
    return { reversed: pending.length };
  }

  /** Ajusta el consumo real cuando difiere de la receta (con motivo). El movimiento original no se toca. */
  async adjustActual(recordId: string, itemId: string, actualQuantity: number, reason: string, user: AuthUser) {
    const moved = await this.prisma.db.stockMovement.findMany({ where: { procedureRecordId: recordId, itemId } });
    const consumed = moved.filter((m) => m.type === StockMovementType.CONSUMPTION);
    if (consumed.length === 0) throw new NotFoundException('Ese insumo no se descargó para este procedimiento');
    const netConsumed = round3(-moved.reduce((sum, m) => sum + Number(m.quantity), 0));
    const delta = round3(netConsumed - actualQuantity); // positivo = se usó menos: se devuelve stock
    if (delta === 0) throw new ConflictException('El consumo real ya coincide con lo descargado');
    return this.prisma.db.stockMovement.create({
      data: {
        itemId,
        locationId: consumed[0].locationId,
        type: StockMovementType.ADJUSTMENT,
        quantity: delta,
        unitCost: consumed[0].unitCost,
        procedureRecordId: recordId,
        reason: `Consumo real: ${actualQuantity}. ${reason.trim()}`,
        createdById: user.id,
      },
    });
  }

  /** Movimientos de insumos de un procedimiento (para mostrar descargo, reversión y ajustes). */
  history(recordId: string) {
    return this.prisma.db.stockMovement.findMany({ where: { procedureRecordId: recordId }, orderBy: { createdAt: 'asc' }, include: { item: { select: { name: true, unit: true } }, location: { select: { name: true } } } });
  }

  private async sourceLocations(tx: Tx, record: ConsumedProcedure) {
    const found = [];
    const professional = await tx.professional.findUnique({ where: { userId: record.performedById }, select: { id: true } });
    if (professional) found.push(await this.locations.forProfessional(professional.id, tx));
    if (record.appointmentId) {
      const appointment = await tx.appointment.findUnique({ where: { id: record.appointmentId }, select: { chair: { select: { officeId: true } } } });
      if (appointment) found.push(await this.locations.forOffice(appointment.chair.officeId, tx));
    }
    return found;
  }
}
