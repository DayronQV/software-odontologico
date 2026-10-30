import 'dotenv/config';
import { Role } from '@prisma/client';
import { PasswordService } from './auth/password.service';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from './auth/password-policy';
import { createSeedContext } from './seed/seed-context';
import { seedProcedures } from './seed/seed-catalog';
import { seedClinicalCatalog } from './seed/seed-clinical';

/**
 * Arranque de PRODUCCIÓN (idempotente): crea el primer administrador y los catálogos base
 * (procedimientos y medicamentos). No crea usuarios de prueba, pacientes ni datos de demostración.
 * El administrador define su MFA en el primer ingreso y debe cambiar la contraseña inicial.
 */
async function main(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const fullName = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador del sistema';
  if (!email || !password) {
    throw new Error('Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD para el arranque de producción');
  }
  if (email.endsWith('@sigo.test')) throw new Error('INITIAL_ADMIN_EMAIL no puede ser un correo de prueba');
  if (!PASSWORD_REGEX.test(password)) throw new Error(PASSWORD_MESSAGE);

  const context = createSeedContext();
  try {
    const exists = await context.prisma.user.findUnique({ where: { email } });
    if (!exists) {
      const passwordHash = await new PasswordService().hash(password);
      await context.prisma.user.create({
        data: { email, fullName, role: Role.ADMIN_TI, passwordHash },
      });
      console.log(`Administrador inicial creado: ${email}`);
    }
    await seedProcedures(context);
    await seedClinicalCatalog(context, email);
    console.log('Catálogos base de producción listos');
  } finally {
    await context.prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
