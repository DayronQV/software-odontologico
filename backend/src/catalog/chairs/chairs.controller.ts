import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditEntity, Roles } from '../../common/decorators';
import { ChairsService } from './chairs.service';
import { CreateChairDto, UpdateChairDto } from './dto/chair.dto';

/** Los sillones se consultan junto con su consultorio (GET /catalog/offices). */
@ApiTags('catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN_TI)
@AuditEntity('Chair')
@Controller('catalog/chairs')
export class ChairsController {
  constructor(private readonly chairs: ChairsService) {}

  @Post()
  create(@Body() dto: CreateChairDto) {
    return this.chairs.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChairDto) {
    return this.chairs.update(id, dto);
  }
}
