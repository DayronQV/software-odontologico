import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, TreatmentItemStatus } from '@prisma/client';
import { ClinicalLookupService } from '../../clinical/shared/clinical-lookup.service';
import { isValidToothCode } from '../../clinical/domain/tooth-notation';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddItemDto, AddPhaseDto, CreatePlanDto, UpdateItemDto } from '../dto/treatments.dto';
import { PLAN_INCLUDE, toPlanView } from './plan-view.mapper';

/** Planes de tratamiento por fases y sesiones, armados a partir de los hallazgos (RF-07). */
@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const plans = await this.prisma.db.treatmentPlan.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: PLAN_INCLUDE,
    });
    return plans.map(toPlanView);
  }

  async get(planId: string) {
    const plan = await this.prisma.db.treatmentPlan.findUnique({ where: { id: planId }, include: PLAN_INCLUDE });
    if (!plan) throw new NotFoundException('Plan de tratamiento no encontrado');
    return toPlanView(plan);
  }

  async create(patientId: string, dto: CreatePlanDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const plan = await this.prisma.db.treatmentPlan.create({
      data: {
        patientId,
        title: dto.title.trim(),
        createdById: user.id,
        phases: { create: { name: 'Fase 1', position: 1 } },
      },
    });
    return this.get(plan.id);
  }

  async addPhase(planId: string, dto: AddPhaseDto) {
    const plan = await this.activePlan(planId);
    const last = await this.prisma.db.treatmentPhase.findFirst({
      where: { planId: plan.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.db.treatmentPhase.create({
      data: { planId, name: dto.name.trim(), position: (last?.position ?? 0) + 1 },
    });
    return this.get(planId);
  }

  async addItem(planId: string, dto: AddItemDto) {
    await this.activePlan(planId);
    const phase = await this.prisma.db.treatmentPhase.findFirst({ where: { id: dto.phaseId, planId } });
    if (!phase) throw new NotFoundException('Fase no encontrada en este plan');
    const procedure = await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } });
    if (!procedure || !procedure.active) {
      throw new BadRequestException('El procedimiento no existe o está desactivado');
    }
    if (dto.toothCode !== undefined && !isValidToothCode(dto.toothCode)) {
      throw new BadRequestException(`El diente ${dto.toothCode} no existe (use un código FDI)`);
    }
    if (dto.surface && dto.toothCode === undefined) {
      throw new BadRequestException('Indique el diente de la superficie');
    }
    await this.prisma.db.treatmentItem.create({
      data: {
        phaseId: dto.phaseId,
        procedureId: dto.procedureId,
        toothCode: dto.toothCode ?? null,
        surface: dto.surface ?? null,
        sessionNumber: dto.sessionNumber ?? null,
        fee: dto.fee ?? procedure.basePrice,
        labCost: dto.labCost ?? procedure.labCost,
        findingId: dto.findingId ?? null,
      },
    });
    return this.get(planId);
  }

  /** Solo se editan ítems todavía pendientes (los aprobados ya forman parte de un acuerdo firmado). */
  async updateItem(planId: string, itemId: string, dto: UpdateItemDto) {
    const item = await this.findItem(planId, itemId);
    if (item.status !== TreatmentItemStatus.PENDING) {
      throw new ConflictException('Solo se pueden modificar ítems pendientes de aprobación');
    }
    if (dto.phaseId) {
      const phase = await this.prisma.db.treatmentPhase.findFirst({ where: { id: dto.phaseId, planId } });
      if (!phase) throw new NotFoundException('Fase no encontrada en este plan');
    }
    await this.prisma.db.treatmentItem.update({
      where: { id: itemId },
      data: {
        phaseId: dto.phaseId,
        sessionNumber: dto.sessionNumber,
        fee: dto.fee,
        labCost: dto.labCost,
      },
    });
    return this.get(planId);
  }

  /** Quita un ítem que nunca avanzó. Si ya está en un presupuesto, hay que cancelarlo. */
  async removeItem(planId: string, itemId: string) {
    const item = await this.findItem(planId, itemId);
    if (item.status !== TreatmentItemStatus.PENDING) {
      throw new ConflictException('Solo se pueden eliminar ítems pendientes');
    }
    const inBudget = await this.prisma.db.budgetLine.count({ where: { itemId } });
    if (inBudget > 0) {
      throw new ConflictException('El ítem ya está en un presupuesto: cancélelo en lugar de eliminarlo');
    }
    await this.prisma.db.treatmentItem.delete({ where: { id: itemId } });
    return this.get(planId);
  }

  /** Descarta un ítem pendiente o aprobado (no realizado ni agendado). */
  async cancelItem(planId: string, itemId: string) {
    const item = await this.findItem(planId, itemId);
    if (item.status !== TreatmentItemStatus.PENDING && item.status !== TreatmentItemStatus.APPROVED) {
      throw new ConflictException('Solo se cancelan ítems pendientes o aprobados sin cita');
    }
    await this.prisma.db.treatmentItem.update({
      where: { id: itemId },
      data: { status: TreatmentItemStatus.CANCELED },
    });
    return this.get(planId);
  }

  async close(planId: string) {
    await this.activePlan(planId);
    await this.prisma.db.treatmentPlan.update({ where: { id: planId }, data: { status: PlanStatus.CLOSED } });
    return this.get(planId);
  }

  // ----------------------------------------------------------------------- interno

  private async activePlan(planId: string) {
    const plan = await this.prisma.db.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan de tratamiento no encontrado');
    if (plan.status !== PlanStatus.ACTIVE) throw new ConflictException('El plan está cerrado');
    return plan;
  }

  private async findItem(planId: string, itemId: string) {
    const item = await this.prisma.db.treatmentItem.findFirst({
      where: { id: itemId, phase: { planId } },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en este plan');
    return item;
  }
}
