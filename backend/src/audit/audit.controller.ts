import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  list(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }

  /** Recalcula la cadena de hashes y reporta si el log fue alterado. */
  @Get('verify')
  @Roles(Role.ADMIN_TI, Role.AUDITOR)
  verify() {
    return this.audit.verifyChain();
  }
}
