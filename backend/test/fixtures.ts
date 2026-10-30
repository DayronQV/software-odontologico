import { INestApplication } from '@nestjs/common';
import { ContactChannel, ProfessionalKind, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createUser, http } from './helpers';

const unique = () => randomUUID().slice(0, 8).toUpperCase();

/** Un consultorio nuevo con sillones. Cada prueba usa recursos propios para no chocar con otras. */
export async function createChairs(app: INestApplication, count = 2) {
  const prisma = app.get(PrismaService);
  const office = await prisma.db.office.create({ data: { name: `Consultorio ${unique()}` } });
  const chairs = [];
  for (let i = 1; i <= count; i++) {
    chairs.push(await prisma.db.chair.create({ data: { officeId: office.id, name: `Sillón ${i}` } }));
  }
  return { officeId: office.id, chairs };
}

/** Odontólogo con horario todos los días de 07:00 a 21:00 (hora de la clínica). */
export async function createProfessional(
  app: INestApplication,
  options: { kind?: ProfessionalKind; specialty?: string } = {},
) {
  const prisma = app.get(PrismaService);
  const user = await createUser(app, Role.ODONTOLOGO);
  const professional = await prisma.db.professional.create({
    data: {
      userId: user.id,
      kind: options.kind ?? ProfessionalKind.GENERAL,
      specialty: options.specialty ?? 'Odontología general',
      schedules: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 420, endMinute: 1260 })),
      },
    },
  });
  return { professionalId: professional.id, user };
}

export async function createProcedure(
  app: INestApplication,
  options: { price?: number; durationMinutes?: number; category?: string } = {},
) {
  const prisma = app.get(PrismaService);
  const code = `T-${unique()}`;
  return prisma.db.procedure.create({
    data: {
      code,
      name: `Procedimiento ${code}`,
      category: options.category ?? 'Pruebas',
      durationMinutes: options.durationMinutes ?? 30,
      basePrice: options.price ?? 50,
    },
  });
}

/** Cuerpo válido para dar de alta a un paciente adulto (se puede sobrescribir cualquier campo). */
export function patientBody(overrides: Record<string, unknown> = {}) {
  const n = unique();
  return {
    firstName: 'Paciente',
    lastName: `Prueba ${n}`,
    documentId: `DOC-${n}${Math.floor(Math.random() * 1e6)}`,
    birthDate: '1990-05-20',
    sex: 'FEMALE',
    phone: `+593 99 ${Math.floor(1000000 + Math.random() * 8999999)}`,
    email: `paciente-${n.toLowerCase()}@correo.test`,
    preferredChannel: ContactChannel.WHATSAPP,
    contactConsent: true,
    emergencyContact: { fullName: 'Contacto Prueba', relationship: 'Hermano', phone: '+593 98 111 2222' },
    ...overrides,
  };
}

/** Alta de un paciente por la API (como lo haría recepción). Devuelve la ficha. */
export async function createPatient(
  app: INestApplication,
  receptionistToken: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await http(app)
    .post('/api/patients')
    .set(bearer(receptionistToken))
    .send(patientBody(overrides))
    .expect(201);
  return res.body as { id: string; fullName: string; firstName: string; documentId: string };
}

/** Anamnesis sin condiciones: habilita la atención clínica. */
export const emptyHistory = {
  systemicDiseases: [],
  drugAllergies: [],
  coagulopathies: [],
  anticoagulated: false,
};

/**
 * Horario `hour:minute` hora de Bogotá (UTC-5) dentro de `daysAhead` días, en formato ISO UTC.
 * Con ≥ 3 días de anticipación se programan los dos recordatorios (48 h y 24 h).
 */
export function slot(daysAhead: number, hour: number, minute = 0, durationMinutes = 30) {
  const base = new Date();
  const start = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + daysAhead, hour + 5, minute),
  );
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export interface AppointmentRequest {
  patientId: string;
  professionalId: string;
  chairId: string;
  procedureIds: string[];
  startAt: string;
  endAt?: string;
  notes?: string;
}

export function postAppointment(app: INestApplication, token: string, body: AppointmentRequest) {
  return http(app).post('/api/agenda/appointments').set(bearer(token)).send(body);
}

/** Espera (con reintentos) a que `check` devuelva un valor; útil para trabajos asíncronos en cola. */
export async function waitFor<T>(
  check: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
  intervalMs = 150,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`waitFor: se agotó el tiempo (${timeoutMs} ms)`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
