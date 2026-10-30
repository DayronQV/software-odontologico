import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { CreateUserDto, SetActiveDto, SetRoleDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN_TI)
@AuditEntity('User')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @AuditAction('ROLE_CHANGED')
  @Patch(':id/role')
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setRole(actor.id, id, dto.role);
  }

  @AuditAction('USER_ACTIVATION_CHANGED')
  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setActive(actor.id, id, dto.active);
  }
}
