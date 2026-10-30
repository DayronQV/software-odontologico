import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditEntity, Roles } from '../../common/decorators';
import { CLINICAL_STAFF } from '../../common/role-groups';
import { TimelineService } from './timeline.service';

@ApiTags('clinical')
@ApiBearerAuth()
@Roles(...CLINICAL_STAFF)
@AuditEntity('ClinicalTimeline')
@Controller('patients/:patientId/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  get(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.timeline.get(patientId);
  }
}
