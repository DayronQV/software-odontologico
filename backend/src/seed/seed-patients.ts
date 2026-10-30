import { ContactChannel, Sex } from '@prisma/client';
import type { SeedContext } from './seed-context';

const yearsAgo = (years: number): Date => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear() - years, 5, 15));
};

const DEMO_PATIENTS = [
  {
    patient: {
      firstName: 'Carlos',
      lastName: 'Mendoza',
      documentId: '0912345678',
      birthDate: yearsAgo(42),
      sex: Sex.MALE,
      phone: '+593 99 123 4567',
      email: 'carlos.mendoza@correo.test',
      preferredChannel: ContactChannel.WHATSAPP,
      contactConsent: true,
    },
    emergency: { fullName: 'Rosa Mendoza', relationship: 'Esposa', phone: '+593 98 765 4321' },
    history: {
      systemicDiseases: ['Hipertensión arterial'],
      drugAllergies: ['Penicilina'],
      coagulopathies: [],
      anticoagulated: true,
      currentMedication: 'Warfarina 5 mg, enalapril 10 mg',
    },
  },
  {
    patient: {
      firstName: 'Sofía',
      lastName: 'Ramírez',
      birthDate: yearsAgo(8),
      sex: Sex.FEMALE,
      phone: '+593 97 555 0101',
      email: 'laura.ramirez@correo.test',
      preferredChannel: ContactChannel.EMAIL,
      contactConsent: true,
    },
    emergency: { fullName: 'Pedro Ramírez', relationship: 'Padre', phone: '+593 97 555 0102' },
    guardian: {
      fullName: 'Laura Ramírez',
      relationship: 'Madre',
      documentId: '0923456789',
      phone: '+593 97 555 0101',
      email: 'laura.ramirez@correo.test',
    },
    history: { systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false },
  },
  {
    // Sin anamnesis a propósito: permite probar que no se puede iniciar la atención (RF-02)
    patient: {
      firstName: 'Ana',
      lastName: 'Torres',
      documentId: '0934567890',
      birthDate: yearsAgo(29),
      sex: Sex.FEMALE,
      phone: '+593 96 222 3344',
      email: 'ana.torres@correo.test',
      preferredChannel: ContactChannel.SMS,
      contactConsent: true,
    },
    emergency: { fullName: 'Luis Torres', relationship: 'Hermano', phone: '+593 96 222 9988' },
  },
];

/** Pacientes de demostración (solo desarrollo). Idempotente por documento/nombre. */
export async function seedPatients({ prisma, crypto }: SeedContext): Promise<void> {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  if (!settings) return;

  for (const demo of DEMO_PATIENTS) {
    const documentHash = demo.patient.documentId ? crypto.blindIndex(demo.patient.documentId) : null;
    const exists = await prisma.patient.findFirst({
      where: documentHash
        ? { documentHash }
        : { firstName: demo.patient.firstName, lastName: demo.patient.lastName },
    });
    if (exists) continue;

    const patient = await prisma.patient.create({ data: { ...demo.patient, documentHash } });
    await prisma.emergencyContact.create({ data: { patientId: patient.id, ...demo.emergency } });
    if ('guardian' in demo && demo.guardian) {
      await prisma.guardian.create({ data: { patientId: patient.id, ...demo.guardian } });
    }
    if ('history' in demo && demo.history) {
      await prisma.medicalHistory.create({ data: { patientId: patient.id, ...demo.history } });
    }
  }
}
