import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FilesModule } from '../files/files.module';
import { SigningModule } from '../signing/signing.module';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { ConsentTemplatesService } from './consents/consent-templates.service';
import { ConsentTemplatesController, ConsentsController } from './consents/consents.controller';
import { ConsentsService } from './consents/consents.service';
import { AddendaService } from './notes/addenda.service';
import { NotesController, VitalSignsController } from './notes/notes.controller';
import { NotesService } from './notes/notes.service';
import { VitalSignsService } from './notes/vital-signs.service';
import { OdontogramController } from './odontogram/odontogram.controller';
import { OdontogramService } from './odontogram/odontogram.service';
import { PerioController } from './perio/perio.controller';
import { PerioService } from './perio/perio.service';
import { ProcedureRecordsController } from './procedures/procedure-records.controller';
import { ProcedureRecordsService } from './procedures/procedure-records.service';
import { MedicationsService } from './prescriptions/medications.service';
import { PrescriptionPdfService } from './prescriptions/prescription-pdf.service';
import { MedicationsController, PrescriptionsController } from './prescriptions/prescriptions.controller';
import { PrescriptionsService } from './prescriptions/prescriptions.service';
import { ClinicalLookupService } from './shared/clinical-lookup.service';
import { ReauthService } from './shared/reauth.service';
import { TimelineController } from './timeline/timeline.controller';
import { TimelineService } from './timeline/timeline.service';

/**
 * Expediente clínico (Fase 2): odontograma, periodontograma, evolución SOEP con firma y adendas,
 * procedimientos realizados (RN-01), consentimientos, recetas, adjuntos y línea de tiempo.
 * Los presupuestos viven en TreatmentsModule, que depende de este.
 */
@Module({
  imports: [AuthModule, CatalogModule, FilesModule, SigningModule],
  controllers: [
    OdontogramController,
    PerioController,
    NotesController,
    VitalSignsController,
    ProcedureRecordsController,
    ConsentsController,
    ConsentTemplatesController,
    PrescriptionsController,
    MedicationsController,
    AttachmentsController,
    TimelineController,
  ],
  providers: [
    ClinicalLookupService,
    ReauthService,
    OdontogramService,
    PerioService,
    NotesService,
    AddendaService,
    VitalSignsService,
    ProcedureRecordsService,
    ConsentTemplatesService,
    ConsentsService,
    MedicationsService,
    PrescriptionsService,
    PrescriptionPdfService,
    AttachmentsService,
    TimelineService,
  ],
  exports: [ClinicalLookupService, ReauthService, ProcedureRecordsService, ConsentsService],
})
export class ClinicalModule {}
