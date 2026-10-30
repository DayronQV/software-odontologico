import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF, DENTISTS } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import {
  CreateFindingDto,
  HistoryQueryDto,
  OdontogramQueryDto,
  RemoveFindingDto,
  SetDentitionDto,
  UpdateFindingDto,
} from './dto/odontogram.dto';
import { OdontogramService } from './odontogram.service';

/** Odontograma (RF-03). Lo ve el personal clínico; solo el odontólogo lo modifica. Todo se audita. */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('Odontogram')
@Controller('patients/:patientId/odontogram')
export class OdontogramController {
  constructor(private readonly service: OdontogramService) {}

  @Roles(...CLINICAL_STAFF)
  @Get()
  get(@Param('patientId', ParseUUIDPipe) patientId: string, @Query() query: OdontogramQueryDto) {
    return this.service.get(patientId, query.at ? new Date(query.at) : undefined);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('history')
  history(@Param('patientId', ParseUUIDPipe) patientId: string, @Query() query: HistoryQueryDto) {
    return this.service.history(patientId, query.toothCode);
  }

  @Roles(...DENTISTS)
  @Put('dentition')
  setDentition(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: SetDentitionDto) {
    return this.service.setDentition(patientId, dto.dentition);
  }

  @Roles(...DENTISTS)
  @Post('findings')
  add(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateFindingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addFinding(patientId, dto, user);
  }

  @Roles(...DENTISTS)
  @Patch('findings/:findingId')
  update(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: UpdateFindingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateFinding(patientId, findingId, dto, user);
  }

  /** Cierra un hallazgo registrado por error; no se borra, queda en el historial. */
  @Roles(...DENTISTS)
  @HttpCode(200)
  @Post('findings/:findingId/remove')
  remove(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: RemoveFindingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeFinding(patientId, findingId, dto, user);
  }
}
