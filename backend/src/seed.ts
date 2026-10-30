import 'dotenv/config';
import { createSeedContext } from './seed/seed-context';
import { seedCatalog } from './seed/seed-catalog';
import { seedPatients } from './seed/seed-patients';
import { SEED_USERS, seedUsers } from './seed/seed-users';

/**
 * Datos de DESARROLLO: usuarios (uno por rol), catálogo, y pacientes de demostración.
 * Contraseña común: variable SEED_PASSWORD (ver .env.example). Idempotente. No corre en producción.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de desarrollo no se ejecuta en producción');
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('Defina SEED_PASSWORD para crear los usuarios semilla');

  const context = createSeedContext();
  try {
    await seedUsers(context, password);
    await seedCatalog(context);
    await seedPatients(context);
    console.log(`Seed listo: ${SEED_USERS.length} usuarios, catálogo y pacientes de demostración`);
  } finally {
    await context.prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
