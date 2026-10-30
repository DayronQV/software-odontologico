import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Reportes y panel de indicadores (BI) con exportación PDF/CSV auditada. */
@Module({
  imports: [CatalogModule, CommissionsModule, InventoryModule],
  controllers: [ReportsController],
  providers: [ReportsService, DashboardService],
})
export class ReportsModule {}
