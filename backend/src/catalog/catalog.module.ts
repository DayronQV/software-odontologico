import { Module } from '@nestjs/common';
import { AlertRulesController } from './alert-rules/alert-rules.controller';
import { AlertRulesService } from './alert-rules/alert-rules.service';
import { ChairsController } from './chairs/chairs.controller';
import { ChairsService } from './chairs/chairs.service';
import { InsurersController } from './insurers/insurers.controller';
import { InsurersService } from './insurers/insurers.service';
import { OfficesController } from './offices/offices.controller';
import { OfficesService } from './offices/offices.service';
import { ProceduresController } from './procedures/procedures.controller';
import { ProceduresService } from './procedures/procedures.service';
import { ProfessionalsController } from './professionals/professionals.controller';
import { ProfessionalsService } from './professionals/professionals.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { ResourceUsageService } from './shared/resource-usage.service';

/** Catálogo médico y parámetros de administración (consultorios, sillones, profesionales, procedimientos…). */
@Module({
  controllers: [
    OfficesController,
    ChairsController,
    ProfessionalsController,
    ProceduresController,
    InsurersController,
    SettingsController,
    AlertRulesController,
  ],
  providers: [
    ResourceUsageService,
    OfficesService,
    ChairsService,
    ProfessionalsService,
    ProceduresService,
    InsurersService,
    SettingsService,
    AlertRulesService,
  ],
  exports: [SettingsService, AlertRulesService, ProfessionalsService],
})
export class CatalogModule {}
