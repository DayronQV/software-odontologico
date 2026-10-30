import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AlertsService } from './alerts.service';
import { ConsumptionService } from './consumption.service';
import { CountsService } from './counts.service';
import { CountsController, InventoryController, SupplyController } from './inventory.controller';
import { LocationsService } from './locations.service';
import { RecipesService } from './recipes.service';
import { StockService } from './stock.service';
import { SupplyService } from './supply.service';

/** Inventario por consultorio y profesional, kardex inmutable y descargo automático (RF-14). */
@Module({
  imports: [CatalogModule],
  controllers: [InventoryController, SupplyController, CountsController],
  providers: [LocationsService, StockService, AlertsService, RecipesService, ConsumptionService, SupplyService, CountsService],
  exports: [AlertsService, ConsumptionService, StockService],
})
export class InventoryModule {}
