import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { SystemService } from './system.service';

@ApiTags('system')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo el administrador de TI' })
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('status')
  @Roles(Role.ADMIN_TI)
  @ApiOperation({ summary: 'Telemetría: servicios, latencias, cola, recursos y actividad de 24 h' })
  @ApiOkResponse({ description: 'Estado del sistema (ok/degraded) con latencias por dependencia' })
  status() {
    return this.system.status();
  }

  @Get('backups')
  @Roles(Role.ADMIN_TI)
  @ApiOperation({ summary: 'Respaldos cifrados disponibles y su retención' })
  @ApiOkResponse({ description: 'Manifiestos de respaldo (id, fecha, tamaño, huella SHA-256)' })
  backups() {
    return this.system.backups();
  }
}
