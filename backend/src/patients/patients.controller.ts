import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_STAFF } from '../common/role-groups';
import type { AuthUser } from '../common/types';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

/**
 * Ficha única del paciente (RF-01). Cada lectura y escritura queda en el log de auditoría
 * (RNF-06). El administrador de TI y el auditor no tienen acceso a datos de pacientes.
 */
@ApiTags('patients')
@ApiBearerAuth()
@AuditEntity('Patient')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Roles(...PATIENT_STAFF)
  @Get()
  list(@Query() query: PatientQueryDto) {
    return this.patients.list(query);
  }

  @Roles(...PATIENT_STAFF)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patients.findOne(id);
  }

  @Roles(Role.RECEPCIONISTA)
  @Post()
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: AuthUser) {
    return this.patients.create(dto, user.id);
  }

  @Roles(Role.RECEPCIONISTA)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }
}
