import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MedicalHistoryController } from './medical-history/medical-history.controller';
import { MedicalHistoryService } from './medical-history/medical-history.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

/** Pacientes: ficha única (RF-01) y anamnesis con alertas médicas (RF-02). */
@Module({
  imports: [CatalogModule],
  controllers: [PatientsController, MedicalHistoryController],
  providers: [PatientsService, MedicalHistoryService],
  exports: [PatientsService],
})
export class PatientsModule {}
