import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { PATIENT_STAFF } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { MedicalHistoryDto } from './dto/medical-history.dto';
import { MedicalHistoryService } from './medical-history.service';

/** Anamnesis del paciente. Cada lectura y cada cambio quedan en el log de auditoría. */
@ApiTags('patients')
@ApiBearerAuth()
@Roles(...PATIENT_STAFF)
@AuditEntity('MedicalHistory')
@Controller('patients/:patientId/medical-history')
export class MedicalHistoryController {
  constructor(private readonly service: MedicalHistoryService) {}

  @Get()
  get(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.service.get(patientId);
  }

  @Put()
  upsert(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: MedicalHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsert(patientId, dto, user.id);
  }
}
