import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PasswordService } from './auth/password.service';

/**
 * Usuarios semilla de DESARROLLO: uno por rol. Idempotente (no pisa contraseñas existentes).
 * Contraseña común: variable SEED_PASSWORD (ver .env.example). Se niega a correr en producción.
 */
const SEED_USERS: Array<{ email: string; fullName: string; role: Role }> = [
  { email: 'admin@sigo.test', fullName: 'Administrador TI', role: Role.ADMIN_TI },
  { email: 'recepcion@sigo.test', fullName: 'Recepcionista Demo', role: Role.RECEPCIONISTA },
  { email: 'odontologo@sigo.test', fullName: 'Odontólogo Demo', role: Role.ODONTOLOGO },
  { email: 'asistente@sigo.test', fullName: 'Asistente Dental Demo', role: Role.ASISTENTE },
  { email: 'auditor@sigo.test', fullName: 'Auditor Contador Demo', role: Role.AUDITOR },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de desarrollo no se ejecuta en producción');
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('Defina SEED_PASSWORD para crear los usuarios semilla');

  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  try {
    const passwordHash = await passwords.hash(password);
    for (const user of SEED_USERS) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: { ...user, passwordHash },
      });
    }
    console.log(`Seed listo: ${SEED_USERS.length} usuarios (uno por rol)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
