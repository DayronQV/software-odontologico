import 'dotenv/config';
import 'reflect-metadata';
import {
  AppointmentStatus,
  ContactChannel,
  FindingStatus,
  FindingType,
  OdontogramDentition,
  PaymentMethod,
  ProfessionalKind,
  Role,
  Sex,
  ToothSurface,
} from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { AuditService } from './audit/audit.service';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from './auth/password-policy';
import { PasswordService } from './auth/password.service';
import { CashSessionsService } from './billing/cash/cash-sessions.service';
import { InvoiceIssuingService } from './billing/invoices/invoice-issuing.service';
import { computeLockAt } from './clinical/domain/note-lock';
import { signatureHash } from './clinical/domain/signature';
import { ProcedureRecordsService } from './clinical/procedures/procedure-records.service';
import type { AuthUser } from './common/types';
import { seedCatalog, type ScheduleMap } from './seed/seed-catalog';
import { seedClinicalDemo } from './seed/seed-clinical';
import { createSeedContext } from './seed/seed-context';
import { seedInventory } from './seed/seed-inventory';

/**
 * DATOS DE DEMOSTRACIÓN para el despliegue (DEMO_DATA=true): una clínica con personal de cada rol, 10 pacientes ficticios,
 * odontogramas, notas firmadas, recetas, un plan con presupuesto, agenda, inventario y varias atenciones cobradas.
 * Personas, documentos y teléfonos son FICTICIOS; los correos usan el dominio reservado example.com (nunca reciben envíos).
 * Idempotente: si el odontólogo Ariel Lindao ya existe no hace nada. La contraseña de todas las cuentas es DEMO_PASSWORD.
 */

const DOMAIN = 'example.com';
const STAFF = [
  { email: `ariel.lindao@${DOMAIN}`, fullName: 'Dr. Ariel Lindao', role: Role.ODONTOLOGO, documentId: '0928374651' },
  { email: `jeffrey.yagual@${DOMAIN}`, fullName: 'Dr. Jeffrey Yagual', role: Role.ODONTOLOGO, documentId: '0927465183' },
  { email: `lays.chica@${DOMAIN}`, fullName: 'Lays Chica', role: Role.RECEPCIONISTA, documentId: '0931827465' },
  { email: `leonel.quinonez@${DOMAIN}`, fullName: 'Leonel Quiñonez', role: Role.ASISTENTE, documentId: '0926183745' },
  { email: `jeanny.cruz@${DOMAIN}`, fullName: 'Jeanny Cruz', role: Role.AUDITOR, documentId: '0929451736' },
];
const ARIEL = STAFF[0].email;
const JEFFREY = STAFF[1].email;
const LAYS = STAFF[2].email;
const LEONEL = STAFF[3].email;

const SCHEDULES: ScheduleMap = {
  [ARIEL]: {
    kind: ProfessionalKind.GENERAL,
    specialty: 'Odontología general y endodoncia',
    slots: [1, 2, 3, 4, 5].map((d) => [d, 8 * 60, 18 * 60]).concat([[6, 8 * 60, 13 * 60]]),
  },
  [JEFFREY]: {
    kind: ProfessionalKind.SPECIALIST,
    specialty: 'Ortodoncia',
    slots: [1, 3, 5].map((d) => [d, 9 * 60, 17 * 60]),
  },
};

const yearsAgo = (years: number, month = 5, day = 15) => new Date(Date.UTC(new Date().getUTCFullYear() - years, month, day));

interface PatientSpec {
  key: string;
  firstName: string;
  lastName: string;
  documentId?: string;
  age: number;
  sex: Sex;
  phone: string;
  channel: ContactChannel;
  emergency: { fullName: string; relationship: string; phone: string };
  guardian?: { fullName: string; relationship: string; documentId: string; phone: string };
  history: { systemicDiseases: string[]; drugAllergies: string[]; coagulopathies: string[]; anticoagulated: boolean; currentMedication?: string };
  insured?: boolean;
}

const PATIENTS: PatientSpec[] = [
  { key: 'ismael', firstName: 'Ismael', lastName: 'Guerrero', documentId: '0912648375', age: 38, sex: Sex.MALE, phone: '+593 99 214 8836', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Karla Guerrero', relationship: 'Esposa', phone: '+593 98 330 1127' }, history: { systemicDiseases: ['Diabetes mellitus tipo 2'], drugAllergies: [], coagulopathies: [], anticoagulated: false, currentMedication: 'Metformina 850 mg' }, insured: true },
  { key: 'carlos', firstName: 'Carlos', lastName: 'Mite', documentId: '0915273846', age: 45, sex: Sex.MALE, phone: '+593 98 745 2210', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Marisol Quimí', relationship: 'Esposa', phone: '+593 98 745 2299' }, history: { systemicDiseases: ['Hipertensión arterial'], drugAllergies: [], coagulopathies: [], anticoagulated: true, currentMedication: 'Acenocumarol 4 mg, losartán 50 mg' } },
  { key: 'omar', firstName: 'Omar', lastName: 'Mite', age: 9, sex: Sex.MALE, phone: '+593 98 745 2210', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Marisol Quimí', relationship: 'Madre', phone: '+593 98 745 2299' }, guardian: { fullName: 'Carlos Mite', relationship: 'Padre', documentId: '0915273846', phone: '+593 98 745 2210' }, history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false } },
  { key: 'emely', firstName: 'Emely', lastName: 'Montero', documentId: '0931746285', age: 27, sex: Sex.FEMALE, phone: '+593 96 482 7731', channel: ContactChannel.EMAIL, emergency: { fullName: 'Jenny Montero', relationship: 'Madre', phone: '+593 96 482 7700' }, history: { systemicDiseases: [], drugAllergies: ['Penicilina'], coagulopathies: [], anticoagulated: false }, insured: true },
  { key: 'mariana', firstName: 'Mariana', lastName: 'Zambrano', documentId: '0924518367', age: 34, sex: Sex.FEMALE, phone: '+593 99 673 1048', channel: ContactChannel.SMS, emergency: { fullName: 'Pablo Zambrano', relationship: 'Hermano', phone: '+593 99 673 1055' }, history: { systemicDiseases: [], drugAllergies: ['Ibuprofeno'], coagulopathies: [], anticoagulated: false } },
  { key: 'kevin', firstName: 'Kevin', lastName: 'Alcívar', documentId: '0950127384', age: 19, sex: Sex.MALE, phone: '+593 98 190 6624', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Narcisa Alcívar', relationship: 'Madre', phone: '+593 98 190 6600' }, history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false } },
  { key: 'rosa', firstName: 'Rosa', lastName: 'Villón', documentId: '0902835716', age: 61, sex: Sex.FEMALE, phone: '+593 94 357 8802', channel: ContactChannel.SMS, emergency: { fullName: 'Walter Villón', relationship: 'Hijo', phone: '+593 94 357 8811' }, history: { systemicDiseases: ['Hipertensión arterial', 'Diabetes mellitus tipo 2'], drugAllergies: [], coagulopathies: [], anticoagulated: false, currentMedication: 'Enalapril 10 mg, glibenclamida 5 mg' } },
  { key: 'andrea', firstName: 'Andrea', lastName: 'Parrales', documentId: '0935681427', age: 31, sex: Sex.FEMALE, phone: '+593 99 508 3369', channel: ContactChannel.EMAIL, emergency: { fullName: 'Luis Parrales', relationship: 'Esposo', phone: '+593 99 508 3370' }, history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false } },
  { key: 'josue', firstName: 'Josué', lastName: 'Tomalá', documentId: '0958314627', age: 22, sex: Sex.MALE, phone: '+593 98 826 4415', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Rita Tomalá', relationship: 'Madre', phone: '+593 98 826 4400' }, history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false } },
  { key: 'valeria', firstName: 'Valeria', lastName: 'Cedeño', age: 14, sex: Sex.FEMALE, phone: '+593 96 117 5528', channel: ContactChannel.WHATSAPP, emergency: { fullName: 'Karen Cedeño', relationship: 'Madre', phone: '+593 96 117 5528' }, guardian: { fullName: 'Karen Cedeño', relationship: 'Madre', documentId: '0917462835', phone: '+593 96 117 5528' }, history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false } },
];

const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.');

/** Día ± n que caiga en uno de los días de semana indicados (0 = domingo), a la hora local de Bogotá (UTC-5). */
function slot(offsetDays: number, allowed: number[], hour: number, minute: number, minutes: number, direction: 1 | -1) {
  const base = new Date();
  let day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays, 12));
  while (!allowed.includes(day.getUTCDay())) day = new Date(day.getTime() + direction * 86_400_000);
  const startAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 5, minute));
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60_000) };
}
const ARIEL_DAYS = [1, 2, 3, 4, 5, 6];
const JEFFREY_DAYS = [1, 3, 5];
const money = (value: number) => Math.round(value * 100) / 100;

async function main(): Promise<void> {
  if (process.env.DEMO_DATA !== 'true') return;
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Defina DEMO_PASSWORD para crear las cuentas de demostración');
  if (!PASSWORD_REGEX.test(password)) throw new Error(PASSWORD_MESSAGE);

  const ctx = createSeedContext();
  const { prisma, crypto } = ctx;
  try {
    if (await prisma.user.findUnique({ where: { email: ARIEL } })) {
      const complete = (await prisma.invoice.count()) > 0;
      console.log(complete ? 'Datos de demostración ya cargados' : 'Carga de demostración incompleta: recree la base de datos para repetirla');
      return;
    }
    const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN_TI }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('Cree primero el administrador (BOOTSTRAP_PRODUCTION)');

    // 1) Personal de la clínica
    const passwordHash = await new PasswordService().hash(password);
    for (const staff of STAFF) await prisma.user.create({ data: { ...staff, passwordHash } });
    const users = new Map((await prisma.user.findMany({ where: { email: { in: STAFF.map((s) => s.email) } } })).map((u) => [u.email, u]));

    // 2) Consultorios, sillones, profesionales con horario, inventario y comisiones
    await seedCatalog(ctx, SCHEDULES);
    await seedInventory(ctx, {
      adminEmail: admin.email,
      stockFactor: (email) => (email === ARIEL ? 0.4 : 0.15),
      commissionPercent: (email) => (email === ARIEL ? 40 : 45),
    });

    // 3) Pacientes con su anamnesis
    const insurer = await prisma.insurer.findFirst({ orderBy: { name: 'asc' } });
    const patients = new Map<string, { id: string }>();
    for (const spec of PATIENTS) {
      const email = `${slug(spec.firstName)}.${slug(spec.lastName)}@${DOMAIN}`.replace(/\.+/g, '.').replace('.@', '@');
      const patient = await prisma.patient.create({
        data: {
          firstName: spec.firstName,
          lastName: spec.lastName,
          documentId: spec.documentId,
          documentHash: spec.documentId ? crypto.blindIndex(spec.documentId) : null,
          birthDate: yearsAgo(spec.age),
          sex: spec.sex,
          phone: spec.phone,
          email: spec.guardian ? `${slug(spec.guardian.fullName)}@${DOMAIN}`.replace(/\.+/g, '.') : email,
          preferredChannel: spec.channel,
          contactConsent: true,
        },
      });
      await prisma.emergencyContact.create({ data: { patientId: patient.id, ...spec.emergency } });
      if (spec.guardian) await prisma.guardian.create({ data: { patientId: patient.id, ...spec.guardian, email: `${slug(spec.guardian.fullName)}@${DOMAIN}`.replace(/\.+/g, '.') } });
      await prisma.medicalHistory.create({ data: { patientId: patient.id, ...spec.history } });
      if (spec.insured && insurer) await prisma.patientInsurance.create({ data: { patientId: patient.id, insurerId: insurer.id, policyNumber: `POL-${spec.key.toUpperCase().slice(0, 3)}-2026`, coveragePercent: 60 } });
      patients.set(spec.key, patient);
    }

    // 4) Historia clínica completa de Ismael (odontograma, periodontograma, signos vitales, nota, plan y presupuesto)
    await seedClinicalDemo(ctx, {
      dentistEmail: ARIEL,
      assistantEmail: LEONEL,
      documentId: '0912648375',
      subjective: 'Refiere dolor intermitente al masticar en la zona inferior derecha desde hace dos semanas y sensibilidad al frío.',
      objective: 'Caries profunda en 46 con sensibilidad a la percusión. Placa moderada generalizada. Glucemia en ayunas controlada según el paciente.',
      assessment: 'Pulpitis irreversible sintomática del 46. Gingivitis leve generalizada.',
      plan: 'Endodoncia del 46 y corona posterior. Profilaxis y control de placa. Coordinar con su médico por la diabetes.',
      planTitle: 'Rehabilitación del sector inferior derecho',
      vitals: { systolic: 124, diastolic: 80, pulse: 74, weightKg: 79.5 },
    });

    // 5) Odontograma y consulta de otros pacientes
    const dentist = users.get(ARIEL)!;
    const ortho = users.get(JEFFREY)!;
    const assistantUser = users.get(LEONEL)!;
    const clinical: Array<{ key: string; by: typeof dentist; dentition: OdontogramDentition; findings: Array<[number, ToothSurface, FindingType, FindingStatus]>; notes: Array<{ daysAgo: number; s: string; o: string; a: string; p: string }> }> = [
      { key: 'carlos', by: dentist, dentition: OdontogramDentition.PERMANENT, findings: [[26, ToothSurface.OCCLUSAL, FindingType.CARIES, FindingStatus.EXISTING], [36, ToothSurface.OCCLUSAL, FindingType.RESTORATION, FindingStatus.EXISTING], [37, ToothSurface.WHOLE, FindingType.ENDODONTICS_DONE, FindingStatus.EXISTING], [48, ToothSurface.WHOLE, FindingType.EXTRACTION, FindingStatus.PLANNED]], notes: [{ daysAgo: 12, s: 'Control odontológico de rutina. Refiere sangrado de encías al cepillarse.', o: 'Gingivitis generalizada, cálculo supragingival en sector anterior inferior. Paciente anticoagulado.', a: 'Gingivitis asociada a placa. Caries oclusal en 26.', p: 'Profilaxis con precaución hemostática, restauración del 26 previa consulta con su hematólogo (INR).' }] },
      { key: 'emely', by: dentist, dentition: OdontogramDentition.PERMANENT, findings: [[16, ToothSurface.OCCLUSAL, FindingType.CARIES, FindingStatus.EXISTING], [25, ToothSurface.MESIAL, FindingType.CARIES, FindingStatus.EXISTING], [26, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.EXISTING], [47, ToothSurface.OCCLUSAL, FindingType.RESTORATION, FindingStatus.EXISTING]], notes: [{ daysAgo: 8, s: 'Dolor leve al comer dulce en molares superiores.', o: 'Caries oclusal en 16 y mesial en 25, sin compromiso pulpar. Alergia a penicilina registrada.', a: 'Caries de esmalte y dentina superficial en 16 y 25.', p: 'Restauraciones con resina en 16 y 25. Analgésico sin penicilinas si hay molestia.' }] },
      { key: 'omar', by: dentist, dentition: OdontogramDentition.MIXED, findings: [[16, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.PLANNED], [26, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.PLANNED], [36, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.PLANNED], [46, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.PLANNED], [75, ToothSurface.OCCLUSAL, FindingType.CARIES, FindingStatus.EXISTING]], notes: [{ daysAgo: 10, s: 'Acude con su padre para control; sin dolor.', o: 'Dentición mixta. Fosas profundas en primeros molares permanentes y caries oclusal en 75.', a: 'Riesgo cariogénico moderado.', p: 'Sellantes en primeros molares, restauración del 75 y refuerzo de higiene con el padre.' }] },
      { key: 'kevin', by: ortho, dentition: OdontogramDentition.PERMANENT, findings: [[11, ToothSurface.WHOLE, FindingType.PROSTHESIS_FIXED, FindingStatus.EXISTING], [21, ToothSurface.WHOLE, FindingType.PROSTHESIS_FIXED, FindingStatus.EXISTING]], notes: [{ daysAgo: 20, s: 'Consulta para ortodoncia por apiñamiento anterior.', o: 'Apiñamiento severo inferior, mordida cruzada anterior leve. Higiene regular.', a: 'Maloclusión clase I con apiñamiento.', p: 'Brackets metálicos, controles cada 4 semanas, instrucción de higiene.' }] },
    ];
    for (const entry of clinical) {
      const patient = patients.get(entry.key)!;
      const odontogram = await prisma.odontogram.create({ data: { patientId: patient.id, dentition: entry.dentition } });
      await prisma.odontogramFinding.createMany({ data: entry.findings.map(([toothCode, surface, type, status]) => ({ odontogramId: odontogram.id, toothCode, surface, type, status, createdById: entry.by.id })) });
      for (const note of entry.notes) {
        const createdAt = new Date(Date.now() - note.daysAgo * 86_400_000);
        const id = randomUUID();
        const content = { patientId: patient.id, appointmentId: null, subjective: note.s, objective: note.o, assessment: note.a, plan: note.p };
        await prisma.evolutionNote.create({ data: { id, ...content, authorId: entry.by.id, createdAt, lockAt: computeLockAt(createdAt, 24), signedAt: createdAt, signedById: entry.by.id, contentHash: signatureHash({ kind: 'NOTE', entityId: id, content, signerId: entry.by.id, signedAt: createdAt }) } });
      }
    }
    await prisma.vitalSigns.create({ data: { patientId: patients.get('carlos')!.id, recordedById: assistantUser.id, systolic: 138, diastolic: 88, pulse: 76, temperatureC: 36.5, oxygenSaturation: 97, weightKg: 84 } });

    // 6) Recetas (sin fármacos a los que el paciente es alérgico)
    const medication = (prefix: string) => prisma.medication.findFirst({ where: { name: { startsWith: prefix } } });
    const [ibuprofeno, metronidazol] = await Promise.all([medication('Ibuprofeno'), medication('Metronidazol')]);
    const prescribe = async (key: string, by: string, diagnosis: string, med: NonNullable<typeof ibuprofeno>, dose: string, frequency: string, duration: string) => {
      const prescription = await prisma.prescription.create({ data: { patientId: patients.get(key)!.id, prescriberId: by, diagnosis } });
      await prisma.prescriptionItem.create({ data: { prescriptionId: prescription.id, medicationId: med.id, name: med.name, dose, frequency, duration, instructions: 'Tomar después de las comidas.' } });
    };
    if (ibuprofeno && metronidazol) {
      await prescribe('emely', dentist.id, 'Caries dentinaria 16 y 25', ibuprofeno, '1 tableta', 'cada 8 horas', '3 días si hay dolor');
      await prescribe('ismael', dentist.id, 'Pulpitis irreversible 46', ibuprofeno, '1 tableta', 'cada 8 horas', '3 días');
      await prescribe('carlos', dentist.id, 'Gingivitis generalizada', metronidazol, '1 tableta', 'cada 8 horas', '5 días');
    }

    // 7) Agenda: atenciones pasadas, canceladas, inasistencia y próximas citas
    const office = await prisma.office.findUniqueOrThrow({ where: { name: 'Consultorio Principal' }, include: { chairs: { orderBy: { name: 'asc' } } } });
    const orthoOffice = await prisma.office.findUniqueOrThrow({ where: { name: 'Consultorio Ortodoncia' }, include: { chairs: true } });
    const professional = async (email: string) => prisma.professional.findFirstOrThrow({ where: { user: { email } } });
    const [ariel, jeffrey] = await Promise.all([professional(ARIEL), professional(JEFFREY)]);
    const procedure = (code: string) => prisma.procedure.findUniqueOrThrow({ where: { code } });
    const lays = users.get(LAYS)!;

    const book = async (key: string, pro: typeof ariel, chairId: string, codes: string[], when: ReturnType<typeof slot>, status: AppointmentStatus, extra: { cancelReason?: string } = {}) => {
      const procedures = await Promise.all(codes.map(procedure));
      const appointment = await prisma.appointment.create({
        data: { patientId: patients.get(key)!.id, professionalId: pro.id, chairId, ...when, status, createdById: lays.id, ...extra, procedures: { create: procedures.map((p) => ({ procedureId: p.id })) } },
      });
      await prisma.appointmentStatusLog.create({ data: { appointmentId: appointment.id, toStatus: AppointmentStatus.SCHEDULED, userId: lays.id } });
      if (status !== AppointmentStatus.SCHEDULED) await prisma.appointmentStatusLog.create({ data: { appointmentId: appointment.id, fromStatus: AppointmentStatus.SCHEDULED, toStatus: status, userId: lays.id, note: extra.cancelReason } });
      return appointment;
    };
    const A = AppointmentStatus;
    const s1 = office.chairs[0].id;
    const s2 = office.chairs[1].id;
    const sA = orthoOffice.chairs[0].id;
    const attended = {
      mariana: await book('mariana', ariel, s1, ['LIMP-01'], slot(-6, ARIEL_DAYS, 9, 0, 45, -1), A.ATTENDED),
      omar: await book('omar', ariel, s2, ['SELL-01'], slot(-5, ARIEL_DAYS, 10, 0, 30, -1), A.ATTENDED),
      kevin: await book('kevin', jeffrey, sA, ['ORTO-01'], slot(-4, JEFFREY_DAYS, 15, 0, 30, -1), A.ATTENDED),
      valeria: await book('valeria', jeffrey, sA, ['ORTO-01'], slot(-8, JEFFREY_DAYS, 16, 0, 30, -1), A.ATTENDED),
      ismael: await book('ismael', ariel, s1, ['CONS-01', 'RX-01'], slot(-3, ARIEL_DAYS, 11, 0, 45, -1), A.ATTENDED),
    };
    await book('josue', ariel, s2, ['CONS-01'], slot(-2, ARIEL_DAYS, 14, 0, 30, -1), A.CANCELED, { cancelReason: 'El paciente avisó que no podía asistir por motivos de trabajo' });
    await book('andrea', ariel, s1, ['LIMP-01'], slot(-7, ARIEL_DAYS, 15, 0, 45, -1), A.NO_SHOW);
    await book('ismael', ariel, s1, ['ENDO-02'], slot(2, ARIEL_DAYS, 9, 0, 120, 1), A.CONFIRMED);
    await book('emely', ariel, s2, ['REST-02'], slot(1, ARIEL_DAYS, 11, 0, 60, 1), A.CONFIRMED);
    await book('carlos', ariel, s1, ['LIMP-01'], slot(3, ARIEL_DAYS, 14, 0, 45, 1), A.SCHEDULED);
    await book('rosa', ariel, s2, ['CONS-01'], slot(4, ARIEL_DAYS, 8, 30, 30, 1), A.SCHEDULED);
    await book('kevin', jeffrey, sA, ['ORTO-01'], slot(14, JEFFREY_DAYS, 15, 0, 30, 1), A.SCHEDULED);

    // 8) Uso real del sistema: procedimientos realizados (descargo de insumos), caja, cobros mixtos y comisiones
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
      const asUser = (u: { id: string; email: string; fullName: string; role: Role }): AuthUser => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, sessionId: 'seed-demo', mfaVerified: true });
      const records = app.get(ProcedureRecordsService, { strict: false });
      const cash = app.get(CashSessionsService, { strict: false });
      const invoices = app.get(InvoiceIssuingService, { strict: false });
      const audit = app.get(AuditService, { strict: false });
      const settings = await prisma.clinicSettings.findUniqueOrThrow({ where: { id: 1 } });
      const tax = Number(settings.taxRatePercent);

      const work: Array<{ key: keyof typeof attended; by: typeof dentist; codes: Array<{ code: string; tooth?: number }>; pay: (total: number) => Array<{ method: PaymentMethod; amount: number; reference?: string; cardToken?: string }> }> = [
        { key: 'mariana', by: dentist, codes: [{ code: 'LIMP-01' }], pay: (t) => [{ method: PaymentMethod.CASH, amount: t }] },
        { key: 'omar', by: dentist, codes: [{ code: 'SELL-01', tooth: 46 }], pay: (t) => [{ method: PaymentMethod.CARD_CREDIT, amount: t, cardToken: 'tok_visa' }] },
        { key: 'kevin', by: ortho, codes: [{ code: 'ORTO-01' }], pay: (t) => [{ method: PaymentMethod.TRANSFER, amount: t, reference: 'TRF-20458' }] },
        { key: 'valeria', by: ortho, codes: [{ code: 'ORTO-01' }], pay: (t) => [{ method: PaymentMethod.CASH, amount: 20 }, { method: PaymentMethod.CARD_DEBIT, amount: money(t - 20), cardToken: 'tok_visa' }] },
        { key: 'ismael', by: dentist, codes: [{ code: 'CONS-01' }, { code: 'RX-01', tooth: 46 }], pay: (t) => [{ method: PaymentMethod.CASH, amount: t }] },
      ];
      const reception = asUser(lays);
      const opening = await cash.open(reception, { openingFloat: 50 });
      let cashIn = 50;
      for (const item of work) {
        const appointment = attended[item.key];
        const patientId = appointment.patientId;
        for (const { code, tooth } of item.codes) {
          const p = await procedure(code);
          await records.register(patientId, { procedureId: p.id, appointmentId: appointment.id, toothCode: tooth }, asUser(item.by));
        }
        const lines = await Promise.all(item.codes.map(async ({ code }) => ({ procedureId: (await procedure(code)).id, quantity: 1 })));
        const net = (await Promise.all(item.codes.map(async ({ code }) => Number((await procedure(code)).basePrice)))).reduce((a, b) => a + b, 0);
        const total = money(net * (1 + tax / 100));
        const payments = item.pay(total);
        await invoices.issue({ patientId, appointmentId: appointment.id, lines, payments } as never, reception);
        cashIn += payments.filter((p) => p.method === PaymentMethod.CASH).reduce((a, p) => a + p.amount, 0);
        await audit.record({ action: 'CREATE', entity: 'Invoice', entityId: appointment.id, userId: lays.id, role: lays.role, ip: '190.15.20.10' });
      }
      await cash.close(opening.id, reception, { countedCash: money(cashIn), notes: 'Cierre del turno de la mañana' });

      for (const spec of PATIENTS) {
        await audit.record({ action: 'CREATE', entity: 'Patient', entityId: patients.get(spec.key)!.id, userId: lays.id, role: lays.role, ip: '190.15.20.10' });
      }
    } finally {
      await app.close();
    }

    console.log(`Datos de demostración listos: ${STAFF.length} cuentas, ${PATIENTS.length} pacientes, agenda, historias clínicas, cobros y comisiones`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
