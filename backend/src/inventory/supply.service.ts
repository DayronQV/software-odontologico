import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupplyRequestStatus } from '@prisma/client';
import { SettingsService } from '../catalog/settings/settings.service';
import { localDayRange } from '../common/local-time';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { round3 } from './domain/stock-math';
import type { RecipeLineDto } from './dto/inventory.dto';

const OPEN = [SupplyRequestStatus.REQUESTED, SupplyRequestStatus.PREPARED];

/** Preparación de insumos para la cita del día (Asistente): se arma desde las recetas y se marca como preparada. */
@Injectable()
export class SupplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Insumos que piden las recetas de los procedimientos de la cita. */
  async suggest(appointmentId: string): Promise<RecipeLineDto[]> {
    const appointment = await this.prisma.db.appointment.findUnique({ where: { id: appointmentId }, include: { procedures: true } });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    const recipes = await this.prisma.db.consumptionRecipe.findMany({ where: { procedureId: { in: appointment.procedures.map((p) => p.procedureId) } } });
    const totals = new Map<string, number>();
    for (const r of recipes) totals.set(r.itemId, round3((totals.get(r.itemId) ?? 0) + Number(r.quantity)));
    return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  async request(appointmentId: string, lines: RecipeLineDto[] | undefined, user: AuthUser) {
    const wanted = lines ?? (await this.suggest(appointmentId));
    if (wanted.length === 0) throw new BadRequestException('La cita no tiene insumos que preparar (revise las recetas de consumo)');
    if (await this.prisma.db.supplyRequest.findFirst({ where: { appointmentId, status: { in: OPEN } } })) {
      throw new ConflictException('Esta cita ya tiene una preparación de insumos');
    }
    const created = await this.prisma.db.supplyRequest.create({
      data: { appointmentId, requestedById: user.id, lines: { create: wanted.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) } },
    });
    return this.get(created.id);
  }

  async prepare(id: string, user: AuthUser) {
    const request = await this.find(id);
    if (request.status !== SupplyRequestStatus.REQUESTED) throw new ConflictException('La solicitud ya fue atendida o cancelada');
    await this.prisma.db.supplyRequest.update({ where: { id }, data: { status: SupplyRequestStatus.PREPARED, preparedById: user.id, preparedAt: new Date() } });
    return this.get(id);
  }

  async cancel(id: string) {
    const request = await this.find(id);
    if (request.status === SupplyRequestStatus.CANCELED) throw new ConflictException('La solicitud ya está cancelada');
    await this.prisma.db.supplyRequest.update({ where: { id }, data: { status: SupplyRequestStatus.CANCELED } });
    return this.get(id);
  }

  /** Solicitudes de las citas de un día (hora de la clínica). */
  async list(date?: string) {
    const { timezone } = await this.settings.get();
    const { start, end } = localDayRange(date ?? new Date().toISOString().slice(0, 10), timezone);
    const appointments = await this.prisma.db.appointment.findMany({
      where: { startAt: { gte: start, lt: end }, status: { notIn: ['CANCELED', 'NO_SHOW'] } },
      orderBy: { startAt: 'asc' },
      include: { patient: { select: { firstName: true, lastName: true } }, chair: { select: { name: true } }, procedures: { include: { procedure: { select: { name: true } } } } },
    });
    const requests = await this.prisma.db.supplyRequest.findMany({ where: { appointmentId: { in: appointments.map((a) => a.id) }, status: { not: SupplyRequestStatus.CANCELED } }, include: { lines: true } });
    const items = new Map((await this.prisma.db.inventoryItem.findMany()).map((i) => [i.id, i]));
    return appointments.map((a) => {
      const request = requests.find((r) => r.appointmentId === a.id);
      return {
        appointmentId: a.id,
        startAt: a.startAt,
        patient: `${a.patient.firstName} ${a.patient.lastName}`,
        chair: a.chair.name,
        procedures: a.procedures.map((p) => p.procedure.name),
        request: request && {
          id: request.id,
          status: request.status,
          preparedAt: request.preparedAt,
          lines: request.lines.map((l) => ({ itemId: l.itemId, item: items.get(l.itemId)?.name ?? l.itemId, unit: items.get(l.itemId)?.unit ?? '', quantity: Number(l.quantity) })),
        },
      };
    });
  }

  private async get(id: string) {
    const request = await this.find(id);
    return { id: request.id, appointmentId: request.appointmentId, status: request.status, lines: request.lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })) };
  }

  private async find(id: string) {
    const request = await this.prisma.db.supplyRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    return request;
  }
}
