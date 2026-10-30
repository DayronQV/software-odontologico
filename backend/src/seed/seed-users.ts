import { Role } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import type { SeedContext } from './seed-context';

/** Usuarios de DESARROLLO: uno por rol y un segundo odontólogo (especialista). */
export const SEED_USERS: Array<{ email: string; fullName: string; role: Role }> = [
  { email: 'admin@sigo.test', fullName: 'Administrador TI', role: Role.ADMIN_TI },
  { email: 'recepcion@sigo.test', fullName: 'Marcela Rojas', role: Role.RECEPCIONISTA },
  { email: 'odontologo@sigo.test', fullName: 'Dr. Andrés Salazar', role: Role.ODONTOLOGO },
  { email: 'especialista@sigo.test', fullName: 'Dra. Camila Vega', role: Role.ODONTOLOGO },
  { email: 'asistente@sigo.test', fullName: 'Paula Giraldo', role: Role.ASISTENTE },
  { email: 'auditor@sigo.test', fullName: 'Héctor Duarte', role: Role.AUDITOR },
];

/** Idempotente: no pisa contraseñas de usuarios existentes. */
export async function seedUsers({ prisma }: SeedContext, password: string): Promise<void> {
  const passwordHash = await new PasswordService().hash(password);
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }
}
