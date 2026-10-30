import { ForbiddenException, Injectable } from '@nestjs/common';
import { PasswordService } from '../../auth/password.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reautenticación para firmar (RF-05): el profesional vuelve a escribir su contraseña.
 * Responde 403 (no 401) para no confundirse con una sesión vencida en el cliente.
 */
@Injectable()
export class ReauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async confirm(userId: string, password: string): Promise<void> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, active: true },
    });
    const valid = !!user?.active && (await this.passwords.verify(user.passwordHash, password));
    if (!valid) {
      throw new ForbiddenException('La contraseña no coincide: la firma no se realizó');
    }
  }
}
