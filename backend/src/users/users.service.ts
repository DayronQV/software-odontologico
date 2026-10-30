import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/users.dto';

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
  ) {}

  list() {
    return this.prisma.db.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    return this.prisma.db.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        fullName: dto.fullName.trim(),
        role: dto.role,
        documentId: dto.documentId,
        passwordHash: await this.passwords.hash(dto.password),
      },
      select: SAFE_SELECT,
    });
  }

  async setRole(actorId: string, id: string, role: Role) {
    if (actorId === id) throw new BadRequestException('No puede cambiar su propio rol');
    return this.prisma.db.user.update({ where: { id }, data: { role }, select: SAFE_SELECT });
  }

  async setActive(actorId: string, id: string, active: boolean) {
    if (actorId === id) throw new BadRequestException('No puede desactivar su propia cuenta');
    const user = await this.prisma.db.user.update({
      where: { id },
      data: { active },
      select: SAFE_SELECT,
    });
    if (!active) await this.auth.revokeAllSessions(id);
    return user;
  }
}
