import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { BudgetStatus, SigningPurpose, SigningRequest, SigningStatus, TreatmentItemStatus } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { sha256 } from '../../clinical/domain/signature';
import { ClinicalLookupService } from '../../clinical/shared/clinical-lookup.service';
import { fromCents } from '../../common/money';
import type { AuthUser } from '../../common/types';
import { BlobStorageService } from '../../files/blob-storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Tx } from '../../prisma/transaction';
import { signingView, SigningService } from '../../signing/signing.service';
import type { PreparedDocument, SigningEvidence, SigningHandler } from '../../signing/signing.types';
import { BUDGET_INCLUDE, budgetLineInputs, type BudgetRow } from '../budgets/budget-view.mapper';
import { renderBudgetPdf } from '../budgets/budget-pdf';
import { approvedTotal, calculateBudget } from '../domain/budget-calculator';
import type { RequestApprovalDto } from '../dto/treatments.dto';

const APPROVABLE: BudgetStatus[] = [BudgetStatus.OPEN, BudgetStatus.PARTIALLY_APPROVED];

/**
 * Aprobación total o parcial del presupuesto por el paciente (RF-08). Se firma igual que un
 * consentimiento (táctil u OTP); al firmar, solo los ítems aprobados pasan a ser tareas agendables.
 */
@Injectable()
export class BudgetApprovalsService implements OnModuleInit, SigningHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly signing: SigningService,
    private readonly settings: SettingsService,
    private readonly blobs: BlobStorageService,
  ) {}

  onModuleInit(): void {
    this.signing.registerHandler(SigningPurpose.BUDGET_APPROVAL, this);
  }

  async request(budgetId: string, dto: RequestApprovalDto, user: AuthUser) {
    const budget = await this.loadBudget(budgetId);
    this.assertApprovable(budget);

    const pendingItems = new Set(
      budget.lines.filter((l) => l.item.status === TreatmentItemStatus.PENDING).map((l) => l.itemId),
    );
    if (pendingItems.size === 0) throw new ConflictException('No quedan ítems pendientes de aprobación');
    const chosen = dto.itemIds ? new Set(dto.itemIds) : pendingItems;
    for (const id of chosen) {
      if (!pendingItems.has(id)) {
        throw new BadRequestException('Algún ítem no pertenece al presupuesto o ya no está pendiente');
      }
    }

    const waiting = budget.approvals.find((a) => a.signing.status === SigningStatus.PENDING);
    if (waiting) {
      const same = waiting.itemIds.length === chosen.size && waiting.itemIds.every((id) => chosen.has(id));
      if (!same) throw new ConflictException('Hay una aprobación pendiente de firma para otros ítems');
      return this.view(waiting.id);
    }

    const total = approvedTotal(budgetLineInputs(budget), chosen, Number(budget.discountPercent));
    const approvalId = await this.prisma.db.$transaction(async (tx) => {
      const request = await this.signing.create(tx, budget.plan.patientId, SigningPurpose.BUDGET_APPROVAL, user.id);
      const approval = await tx.budgetApproval.create({
        data: {
          budgetId,
          signingId: request.id,
          itemIds: [...chosen],
          approvedTotal: fromCents(total),
          createdById: user.id,
        },
      });
      return approval.id;
    });
    return this.view(approvalId);
  }

  async view(approvalId: string) {
    const approval = await this.prisma.db.budgetApproval.findUnique({
      where: { id: approvalId },
      include: { signing: true, budget: { select: { version: true, planId: true, plan: { select: { patientId: true } } } } },
    });
    if (!approval) throw new NotFoundException('Aprobación no encontrada');
    return {
      id: approval.id,
      budgetId: approval.budgetId,
      patientId: approval.budget.plan.patientId,
      version: approval.budget.version,
      itemIds: approval.itemIds,
      approvedTotal: approval.approvedTotal,
      createdAt: approval.createdAt,
      hasPdf: !!approval.pdfKey,
      pdfHash: approval.pdfHash,
      signing: signingView(approval.signing),
    };
  }

  /** PDF firmado (verificando su integridad) o vista previa si todavía no se firma. */
  async pdf(approvalId: string): Promise<{ buffer: Buffer; filename: string }> {
    const approval = await this.prisma.db.budgetApproval.findUnique({
      where: { id: approvalId },
      include: { signing: true },
    });
    if (!approval) throw new NotFoundException('Aprobación no encontrada');
    const filename = `presupuesto-${approval.id.slice(0, 8)}.pdf`;
    if (approval.signing.status === SigningStatus.SIGNED && approval.pdfKey) {
      const buffer = await this.blobs.get(approval.pdfKey);
      if (approval.pdfHash && sha256(buffer) !== approval.pdfHash) {
        throw new InternalServerErrorException('El documento almacenado no coincide con su huella de integridad');
      }
      return { buffer, filename };
    }
    const budget = await this.loadBudget(approval.budgetId);
    return { buffer: await this.draw(budget, approval.itemIds, undefined), filename };
  }

  // -------------------------------------------------------- SigningHandler (firma)

  async prepare(request: SigningRequest, evidence: SigningEvidence): Promise<PreparedDocument> {
    const approval = await this.prisma.db.budgetApproval.findUniqueOrThrow({ where: { signingId: request.id } });
    const budget = await this.loadBudget(approval.budgetId);
    const buffer = await this.draw(budget, approval.itemIds, evidence);
    const key = `budgets/${budget.plan.patientId}/${approval.id}.pdf`;
    await this.blobs.put(key, buffer, 'application/pdf');
    return { key, hash: sha256(buffer) };
  }

  async commit(request: SigningRequest, evidence: SigningEvidence, document: PreparedDocument, tx: Tx): Promise<void> {
    const approval = await tx.budgetApproval.findUniqueOrThrow({
      where: { signingId: request.id },
      include: { budget: { include: { lines: true } } },
    });
    if (!APPROVABLE.includes(approval.budget.status)) {
      throw new ConflictException('El presupuesto cambió mientras se firmaba: genere la aprobación de nuevo');
    }
    // Solo los ítems aprobados se vuelven agendables (RF-08).
    const approved = await tx.treatmentItem.updateMany({
      where: { id: { in: approval.itemIds }, status: TreatmentItemStatus.PENDING },
      data: { status: TreatmentItemStatus.APPROVED, approvedAt: evidence.signedAt },
    });
    if (approved.count !== approval.itemIds.length) {
      throw new ConflictException('Algún ítem dejó de estar pendiente: genere la aprobación de nuevo');
    }
    const stillPending = await tx.treatmentItem.count({
      where: {
        id: { in: approval.budget.lines.map((l) => l.itemId) },
        status: TreatmentItemStatus.PENDING,
      },
    });
    await tx.budget.update({
      where: { id: approval.budgetId },
      data: { status: stillPending === 0 ? BudgetStatus.APPROVED : BudgetStatus.PARTIALLY_APPROVED },
    });
    await tx.budgetApproval.update({
      where: { id: approval.id },
      data: { pdfKey: document.key, pdfHash: document.hash },
    });
  }

  // ----------------------------------------------------------------------- interno

  private assertApprovable(budget: BudgetRow): void {
    if (APPROVABLE.includes(budget.status)) return;
    const reasons: Partial<Record<BudgetStatus, string>> = {
      PENDING_AUTHORIZATION: 'El descuento de este presupuesto aún no fue autorizado',
      SUPERSEDED: 'Este presupuesto fue reemplazado por una versión más reciente',
      APPROVED: 'Este presupuesto ya fue aprobado por completo',
    };
    throw new ConflictException(reasons[budget.status] ?? 'El presupuesto no admite aprobación');
  }

  private loadBudget(budgetId: string): Promise<BudgetRow> {
    return this.prisma.db.budget
      .findUnique({ where: { id: budgetId }, include: BUDGET_INCLUDE })
      .then((row) => {
        if (!row) throw new NotFoundException('Presupuesto no encontrado');
        return row;
      });
  }

  private async draw(budget: BudgetRow, itemIds: string[], evidence: SigningEvidence | undefined): Promise<Buffer> {
    const [clinic, patient] = await Promise.all([
      this.settings.get(),
      this.lookup.assertPatient(budget.plan.patientId),
    ]);
    const approved = new Set(itemIds);
    const totals = calculateBudget(budgetLineInputs(budget), Number(budget.discountPercent));
    return renderBudgetPdf({
      clinicName: clinic.clinicName,
      timezone: clinic.timezone,
      currency: clinic.currency,
      patientName: `${patient.firstName} ${patient.lastName}`,
      planTitle: budget.plan.title,
      version: budget.version,
      phases: totals.phases.map((phase) => ({
        name: phase.name,
        total: fromCents(phase.totalCents),
        lines: budget.lines
          .filter((l) => l.phasePosition === phase.position)
          .map((l) => ({
            description: l.description,
            fee: Number(l.fee),
            labCost: Number(l.labCost),
            approved: approved.has(l.itemId),
          })),
      })),
      subtotalFees: Number(budget.subtotalFees),
      subtotalLab: Number(budget.subtotalLab),
      discountPercent: Number(budget.discountPercent),
      discountAmount: Number(budget.discountAmount),
      total: Number(budget.total),
      approval: {
        approvedTotal: fromCents(approvedTotal(budgetLineInputs(budget), approved, Number(budget.discountPercent))),
        partial: approved.size < budget.lines.length,
        evidence,
      },
    });
  }
}
