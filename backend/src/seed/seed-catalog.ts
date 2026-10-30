import { ProfessionalKind } from '@prisma/client';
import type { SeedContext } from './seed-context';

const OFFICES = [
  { name: 'Consultorio Principal', address: 'Piso 1', chairs: ['Sillón 1', 'Sillón 2', 'Sillón 3'] },
  { name: 'Consultorio Ortodoncia', address: 'Piso 2', chairs: ['Sillón A'] },
];

const INSURERS = ['Seguros Sonrisa', 'Convenio Salud Total'];

export const PROCEDURES = [
  { code: 'CONS-01', name: 'Consulta de valoración', category: 'Diagnóstico', durationMinutes: 30, basePrice: 25, labCost: 0, requiresConsent: false },
  { code: 'RX-01', name: 'Radiografía periapical', category: 'Diagnóstico', durationMinutes: 15, basePrice: 12, labCost: 0, requiresConsent: false },
  { code: 'LIMP-01', name: 'Limpieza dental (profilaxis)', category: 'Preventiva', durationMinutes: 45, basePrice: 40, labCost: 0, requiresConsent: false },
  { code: 'FLUOR-01', name: 'Aplicación de flúor', category: 'Preventiva', durationMinutes: 20, basePrice: 18, labCost: 0, requiresConsent: false },
  { code: 'SELL-01', name: 'Sellante de fosas y fisuras', category: 'Preventiva', durationMinutes: 30, basePrice: 22, labCost: 0, requiresConsent: false },
  { code: 'REST-01', name: 'Restauración con resina (1 superficie)', category: 'Restauradora', durationMinutes: 45, basePrice: 55, labCost: 0, requiresConsent: true },
  { code: 'REST-02', name: 'Restauración con resina (2 superficies)', category: 'Restauradora', durationMinutes: 60, basePrice: 75, labCost: 0, requiresConsent: true },
  { code: 'ENDO-01', name: 'Endodoncia unirradicular', category: 'Endodoncia', durationMinutes: 90, basePrice: 180, labCost: 15, requiresConsent: true },
  { code: 'ENDO-02', name: 'Endodoncia multirradicular', category: 'Endodoncia', durationMinutes: 120, basePrice: 260, labCost: 20, requiresConsent: true },
  { code: 'EXO-01', name: 'Exodoncia simple', category: 'Cirugía', durationMinutes: 40, basePrice: 60, labCost: 0, requiresConsent: true },
  { code: 'EXO-02', name: 'Exodoncia de tercer molar', category: 'Cirugía', durationMinutes: 75, basePrice: 140, labCost: 0, requiresConsent: true },
  { code: 'CORO-01', name: 'Corona de porcelana', category: 'Prótesis', durationMinutes: 60, basePrice: 320, labCost: 90, requiresConsent: true },
  { code: 'ORTO-01', name: 'Control de ortodoncia', category: 'Ortodoncia', durationMinutes: 30, basePrice: 35, labCost: 0, requiresConsent: false },
];

/** Horarios laborales por correo: [día de la semana, desde, hasta] en minutos (0 = domingo). */
const SCHEDULES: Record<string, { kind: ProfessionalKind; specialty: string; slots: number[][] }> = {
  'odontologo@sigo.test': {
    kind: ProfessionalKind.GENERAL,
    specialty: 'Odontología general',
    slots: [1, 2, 3, 4, 5].map((d) => [d, 8 * 60, 18 * 60]).concat([[6, 8 * 60, 13 * 60]]),
  },
  'especialista@sigo.test': {
    kind: ProfessionalKind.SPECIALIST,
    specialty: 'Ortodoncia',
    slots: [1, 3, 5].map((d) => [d, 9 * 60, 17 * 60]),
  },
};

/** Catálogo de demostración: consultorios, sillones, procedimientos, seguros y profesionales. Idempotente. */
export async function seedProcedures({ prisma }: SeedContext): Promise<void> {
  for (const procedure of PROCEDURES) {
    await prisma.procedure.upsert({ where: { code: procedure.code }, update: {}, create: procedure });
  }
}

export async function seedCatalog({ prisma }: SeedContext): Promise<void> {
  for (const office of OFFICES) {
    const saved = await prisma.office.upsert({
      where: { name: office.name },
      update: {},
      create: { name: office.name, address: office.address },
    });
    for (const name of office.chairs) {
      await prisma.chair.upsert({
        where: { officeId_name: { officeId: saved.id, name } },
        update: {},
        create: { officeId: saved.id, name },
      });
    }
  }
  for (const name of INSURERS) {
    await prisma.insurer.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const procedure of PROCEDURES) {
    await prisma.procedure.upsert({ where: { code: procedure.code }, update: {}, create: procedure });
  }

  for (const [email, config] of Object.entries(SCHEDULES)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    const professional = await prisma.professional.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, kind: config.kind, specialty: config.specialty },
    });
    const existing = await prisma.professionalSchedule.count({ where: { professionalId: professional.id } });
    if (existing === 0) {
      await prisma.professionalSchedule.createMany({
        data: config.slots.map(([weekday, startMinute, endMinute]) => ({
          professionalId: professional.id,
          weekday,
          startMinute,
          endMinute,
        })),
      });
    }
  }
}
