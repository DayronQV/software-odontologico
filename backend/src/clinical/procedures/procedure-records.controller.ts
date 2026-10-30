import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF, DENTISTS } from '../../common/role-groups';
import { AUTH_THROTTLE } from '../../common/throttle';
import type { AuthUser } from '../../common/types';
import { AddendaService } from '../notes/addenda.service';
import { CreateAddendumDto } from '../notes/dto/notes.dto';
import { RegisterProcedureDto } from './dto/procedure-record.dto';
import { ProcedureRecordsService } from './procedure-records.service';

/**
 * Procedimientos realizados (RN-01). Solo hay lectura, registro y adenda: no existe ninguna ruta
 * para modificar ni borrar un procedimiento realizado.
 */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('ProcedureRecord')
@Controller()
export class ProcedureRecordsController {
  constructor(
    private readonly records: ProcedureRecordsService,
    private readonly addenda: AddendaService,
  ) {}

  @Roles(...CLINICAL_STAFF)
  @Get('patients/:patientId/procedure-records')
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.records.list(patientId);
  }

  @Roles(...DENTISTS)
  @Post('patients/:patientId/procedure-records')
  register(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: RegisterProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.records.register(patientId, dto, user);
  }

  /** Corrección firmada de un procedimiento realizado. */
  @Roles(...DENTISTS)
  @Throttle({ default: AUTH_THROTTLE })
  @AuditAction('ADDENDUM')
  @Post('procedure-records/:recordId/addenda')
  addendum(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: CreateAddendumDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.addenda.addToProcedureRecord(recordId, dto, user);
  }
}
