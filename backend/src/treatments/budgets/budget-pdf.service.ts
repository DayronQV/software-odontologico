import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../catalog/settings/settings.service';
import { ClinicalLookupService } from '../../clinical/shared/clinical-lookup.service';
import { fromCents } from '../../common/money';
import { calculateBudget } from '../domain/budget-calculator';
import { budgetLineInputs } from './budget-view.mapper';
import { renderBudgetPdf } from './budget-pdf';
import { BudgetsService } from './budgets.service';

/** PDF del presupuesto tal como se presenta al paciente (sin aprobación). */
@Injectable()
export class BudgetPdfService {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly settings: SettingsService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async render(budgetId: string): Promise<{ buffer: Buffer; filename: string }> {
    const budget = await this.budgets.findOne(budgetId);
    const [clinic, patient] = await Promise.all([
      this.settings.get(),
      this.lookup.assertPatient(budget.plan.patientId),
    ]);
    const totals = calculateBudget(budgetLineInputs(budget), Number(budget.discountPercent));
    const buffer = await renderBudgetPdf({
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
            approved: false,
          })),
      })),
      subtotalFees: Number(budget.subtotalFees),
      subtotalLab: Number(budget.subtotalLab),
      discountPercent: Number(budget.discountPercent),
      discountAmount: Number(budget.discountAmount),
      total: Number(budget.total),
    });
    return { buffer, filename: `presupuesto-v${budget.version}.pdf` };
  }
}
