import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { AlertsService } from './alerts.service';
import { ConsumptionService } from './consumption.service';
import { CountsService } from './counts.service';
import {
  AdjustConsumptionDto,
  AdjustDto,
  CreateCountDto,
  CreateSupplyRequestDto,
  EntryDto,
  ItemDto,
  KardexQueryDto,
  ReasonDto,
  SetCountDto,
  SetRecipeDto,
  StockQueryDto,
  SupplyQueryDto,
  TransferDto,
} from './dto/inventory.dto';
import { LocationsService } from './locations.service';
import { RecipesService } from './recipes.service';
import { StockService } from './stock.service';
import { SupplyService } from './supply.service';

/** Quién consulta y quién mueve el inventario: el Auditor solo lee y concilia; el Asistente prepara y registra. */
const READERS = [Role.ADMIN_TI, Role.ASISTENTE, Role.AUDITOR];
const WRITERS = [Role.ADMIN_TI, Role.ASISTENTE];
const COUNTERS = [Role.ADMIN_TI, Role.ASISTENTE, Role.AUDITOR];
const SUPPLY = [Role.ADMIN_TI, Role.ASISTENTE, Role.ODONTOLOGO];

@ApiTags('inventory')
@ApiBearerAuth()
@AuditEntity('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly alerts: AlertsService,
    private readonly recipes: RecipesService,
    private readonly consumption: ConsumptionService,
  ) {}

  @Roles(...READERS)
  @Get('items')
  items() {
    return this.stock.listItems(true);
  }

  @Roles(Role.ADMIN_TI)
  @Post('items')
  createItem(@Body() dto: ItemDto) {
    return this.stock.saveItem(dto);
  }

  @Roles(Role.ADMIN_TI)
  @Put('items/:id')
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ItemDto) {
    return this.stock.saveItem(dto, id);
  }

  @Roles(...READERS)
  @Get('locations')
  locationList() {
    return this.locations.list();
  }

  @Roles(...READERS)
  @Get('stock')
  overview(@Query() query: StockQueryDto) {
    return this.stock.overview(query.locationId);
  }

  @Roles(...READERS)
  @Get('alerts')
  alertList() {
    return this.alerts.list();
  }

  @Roles(...READERS)
  @Get('movements')
  kardex(@Query() query: KardexQueryDto) {
    return this.stock.kardex(query);
  }

  @Roles(...WRITERS)
  @Post('entries')
  entry(@Body() dto: EntryDto, @CurrentUser() user: AuthUser) {
    return this.stock.entry(dto, user);
  }

  @Roles(...WRITERS)
  @Post('adjustments')
  adjust(@Body() dto: AdjustDto, @CurrentUser() user: AuthUser) {
    return this.stock.adjust(dto, user);
  }

  @Roles(...WRITERS)
  @Post('transfers')
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser) {
    return this.stock.transfer(dto, user);
  }

  // ---------------------------------------------------------------- recetas y consumo
  @Roles(...READERS, Role.ODONTOLOGO)
  @Get('recipes')
  recipeList() {
    return this.recipes.list();
  }

  @Roles(Role.ADMIN_TI)
  @Put('recipes/:procedureId')
  setRecipe(@Param('procedureId', ParseUUIDPipe) procedureId: string, @Body() dto: SetRecipeDto) {
    return this.recipes.replace(procedureId, dto.lines);
  }

  @Roles(...READERS, Role.ODONTOLOGO)
  @Get('consumption/:recordId')
  consumptionHistory(@Param('recordId', ParseUUIDPipe) recordId: string) {
    return this.consumption.history(recordId);
  }

  /** Corrige el consumo real cuando difiere de la receta. El descargo original no se borra. */
  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO)
  @Post('consumption/:recordId/adjust')
  adjustConsumption(@Param('recordId', ParseUUIDPipe) recordId: string, @Body() dto: AdjustConsumptionDto, @CurrentUser() user: AuthUser) {
    return this.consumption.adjustActual(recordId, dto.itemId, dto.actualQuantity, dto.reason, user);
  }

  @Roles(Role.ADMIN_TI, Role.ODONTOLOGO)
  @HttpCode(200)
  @Post('consumption/:recordId/reverse')
  reverseConsumption(@Param('recordId', ParseUUIDPipe) recordId: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.consumption.reverse(recordId, dto.reason, user);
  }
}

/** Preparación de insumos para las citas del día. */
@ApiTags('inventory')
@ApiBearerAuth()
@AuditEntity('SupplyRequest')
@Controller('inventory/supply')
export class SupplyController {
  constructor(private readonly supply: SupplyService) {}

  @Roles(...SUPPLY)
  @Get()
  list(@Query() query: SupplyQueryDto) {
    return this.supply.list(query.date);
  }

  @Roles(...SUPPLY)
  @Get('suggest/:appointmentId')
  suggest(@Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.supply.suggest(appointmentId);
  }

  @Roles(...SUPPLY)
  @Post()
  request(@Body() dto: CreateSupplyRequestDto, @CurrentUser() user: AuthUser) {
    return this.supply.request(dto.appointmentId, dto.lines, user);
  }

  @Roles(Role.ADMIN_TI, Role.ASISTENTE)
  @HttpCode(200)
  @Post(':id/prepare')
  prepare(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.supply.prepare(id, user);
  }

  @Roles(...SUPPLY)
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.supply.cancel(id);
  }
}

/** Inventario físico: toma, conteo y conciliación. */
@ApiTags('inventory')
@ApiBearerAuth()
@AuditEntity('StockCount')
@Controller('inventory/counts')
export class CountsController {
  constructor(private readonly counts: CountsService) {}

  @Roles(...COUNTERS)
  @Get()
  list() {
    return this.counts.list();
  }

  @Roles(...COUNTERS)
  @Post()
  create(@Body() dto: CreateCountDto, @CurrentUser() user: AuthUser) {
    return this.counts.create(dto.locationId, user);
  }

  @Roles(...COUNTERS)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.counts.get(id);
  }

  @Roles(...COUNTERS)
  @Put(':id')
  setCounted(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetCountDto) {
    return this.counts.setCounted(id, dto.lines);
  }

  /** Solo el Auditor (y el administrador) concilian: genera los ajustes contra el sistema. */
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  @HttpCode(200)
  @Post(':id/reconcile')
  reconcile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.counts.reconcile(id, user);
  }
}
