import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { SettlementsService } from './settlements.service';

/** Comisiones médicas y liquidación de honorarios (RF-13). */
@Module({
  imports: [CatalogModule],
  controllers: [CommissionsController],
  providers: [CommissionsService, SettlementsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
