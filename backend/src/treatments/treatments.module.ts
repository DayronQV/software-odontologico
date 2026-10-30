import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { FilesModule } from '../files/files.module';
import { SigningModule } from '../signing/signing.module';
import { BudgetApprovalsService } from './approvals/budget-approvals.service';
import { BudgetPdfService } from './budgets/budget-pdf.service';
import { BudgetsService } from './budgets/budgets.service';
import { TreatmentPlansService } from './plans/treatment-plans.service';
import { SchedulableItemsService } from './schedulable/schedulable-items.service';
import {
  BudgetsController,
  SchedulableItemsController,
  TreatmentPlansController,
} from './treatments.controller';

/** Planes de tratamiento, presupuestos y su aprobación (RF-07, RF-08). */
@Module({
  imports: [CatalogModule, ClinicalModule, FilesModule, SigningModule],
  controllers: [TreatmentPlansController, BudgetsController, SchedulableItemsController],
  providers: [
    TreatmentPlansService,
    BudgetsService,
    BudgetPdfService,
    BudgetApprovalsService,
    SchedulableItemsService,
  ],
})
export class TreatmentsModule {}
