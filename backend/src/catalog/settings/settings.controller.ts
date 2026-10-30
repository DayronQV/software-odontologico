import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnyRole, AuditEntity, Roles } from '../../common/decorators';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @AnyRole()
  @Get()
  get() {
    return this.settings.get();
  }

  @Roles(Role.ADMIN_TI)
  @AuditEntity('ClinicSettings')
  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
