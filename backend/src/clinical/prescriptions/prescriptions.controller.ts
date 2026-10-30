import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF, DENTISTS } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import {
  CheckPrescriptionDto,
  CreatePrescriptionDto,
  MedicationDto,
  VoidPrescriptionDto,
} from './dto/prescription.dto';
import { MedicationsService } from './medications.service';
import { PrescriptionPdfService } from './prescription-pdf.service';
import { PrescriptionsService } from './prescriptions.service';

/** Recetas odontológicas. Las emite el odontólogo; el personal clínico las consulta. */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('Prescription')
@Controller()
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly pdf: PrescriptionPdfService,
  ) {}

  @Roles(...CLINICAL_STAFF)
  @Get('patients/:patientId/prescriptions')
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.prescriptions.list(patientId);
  }

  /** Alerta de alergias en vivo mientras se arma la receta. No guarda nada. */
  @Roles(...DENTISTS)
  @HttpCode(200)
  @AuditAction('CHECK')
  @Post('patients/:patientId/prescriptions/check')
  check(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: CheckPrescriptionDto) {
    return this.prescriptions.check(patientId, dto.items);
  }

  @Roles(...DENTISTS)
  @Post('patients/:patientId/prescriptions')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prescriptions.create(patientId, dto, user);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('prescriptions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptions.get(id);
  }

  @Roles(...CLINICAL_STAFF)
  @AuditAction('DOWNLOAD')
  @Get('prescriptions/:id/pdf')
  async download(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.pdf.render(id);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="${filename}"` });
  }

  /** Anular no borra: la receta queda marcada con el motivo. */
  @Roles(...DENTISTS)
  @HttpCode(200)
  @AuditAction('VOID')
  @Post('prescriptions/:id/void')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prescriptions.void(id, dto.reason, user);
  }
}

/** Catálogo de medicamentos: lo mantiene el administrador y lo consulta el personal clínico. */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('Medication')
@Controller('clinical/medications')
export class MedicationsController {
  constructor(private readonly medications: MedicationsService) {}

  @Roles(Role.ADMIN_TI, ...CLINICAL_STAFF)
  @Get()
  list() {
    return this.medications.list();
  }

  @Roles(Role.ADMIN_TI)
  @Post()
  create(@Body() dto: MedicationDto) {
    return this.medications.create(dto);
  }

  @Roles(Role.ADMIN_TI)
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MedicationDto) {
    return this.medications.update(id, dto);
  }
}
