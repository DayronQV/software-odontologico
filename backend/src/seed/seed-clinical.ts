import { randomUUID } from 'node:crypto';
import { FindingStatus, FindingType, PerioSite, ToothSurface } from '@prisma/client';
import { DEFAULT_CONSENT_BODY } from '../clinical/consents/consent-text';
import { computeLockAt } from '../clinical/domain/note-lock';
import { archTeeth } from '../clinical/domain/tooth-notation';
import { signatureHash } from '../clinical/domain/signature';
import { fromCents, toCents } from '../common/money';
import { calculateBudget } from '../treatments/domain/budget-calculator';
import type { SeedContext } from './seed-context';

const MEDICATIONS = [
  {
    name: 'Amoxicilina 500 mg cápsulas',
    activeIngredient: 'Amoxicilina',
    presentation: 'Cápsulas 500 mg',
    allergyGroups: ['penicilina', 'betalactámico', 'amoxicilina'],
  },
  {
    name: 'Amoxicilina + ácido clavulánico 875/125 mg',
    activeIngredient: 'Amoxicilina / ácido clavulánico',
    presentation: 'Tabletas 875/125 mg',
    allergyGroups: ['penicilina', 'betalactámico', 'amoxicilina'],
  },
  {
    name: 'Penicilina V potásica 500 mg',
    activeIngredient: 'Fenoximetilpenicilina',
    presentation: 'Tabletas 500 mg',
    allergyGroups: ['penicilina', 'betalactámico'],
  },
  {
    name: 'Azitromicina 500 mg',
    activeIngredient: 'Azitromicina',
    presentation: 'Tabletas 500 mg',
    allergyGroups: ['macrólido', 'azitromicina'],
  },
  {
    name: 'Clindamicina 300 mg',
    activeIngredient: 'Clindamicina',
    presentation: 'Cápsulas 300 mg',
    allergyGroups: ['lincosamida', 'clindamicina'],
  },
  {
    name: 'Metronidazol 500 mg',
    activeIngredient: 'Metronidazol',
    presentation: 'Tabletas 500 mg',
    allergyGroups: ['nitroimidazol', 'metronidazol'],
  },
  {
    name: 'Ibuprofeno 400 mg',
    activeIngredient: 'Ibuprofeno',
    presentation: 'Tabletas 400 mg',
    allergyGroups: ['aines', 'antiinflamatorio', 'ibuprofeno'],
  },
  {
    name: 'Naproxeno 550 mg',
    activeIngredient: 'Naproxeno sódico',
    presentation: 'Tabletas 550 mg',
    allergyGroups: ['aines', 'antiinflamatorio', 'naproxeno'],
  },
  {
    name: 'Diclofenaco 50 mg',
    activeIngredient: 'Diclofenaco',
    presentation: 'Tabletas 50 mg',
    allergyGroups: ['aines', 'antiinflamatorio', 'diclofenaco'],
  },
  {
    name: 'Ketorolaco 10 mg',
    activeIngredient: 'Ketorolaco',
    presentation: 'Tabletas 10 mg',
    allergyGroups: ['aines', 'antiinflamatorio', 'ketorolaco'],
  },
  {
    name: 'Paracetamol 500 mg',
    activeIngredient: 'Paracetamol',
    presentation: 'Tabletas 500 mg',
    allergyGroups: ['paracetamol', 'acetaminofén'],
  },
  {
    name: 'Dexametasona 4 mg',
    activeIngredient: 'Dexametasona',
    presentation: 'Tabletas 4 mg',
    allergyGroups: ['corticoide', 'dexametasona'],
  },
  {
    name: 'Clorhexidina 0,12 % enjuague',
    activeIngredient: 'Clorhexidina',
    presentation: 'Solución 0,12 %',
    allergyGroups: ['clorhexidina'],
  },
  {
    name: 'Lidocaína 2 % con epinefrina',
    activeIngredient: 'Lidocaína',
    presentation: 'Anestésico local',
    allergyGroups: ['anestésico', 'lidocaína'],
  },
];

/** Generador pseudoaleatorio determinista: los datos de demostración son siempre iguales. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SITES: PerioSite[] = [
  PerioSite.V_MESIAL,
  PerioSite.V_MIDDLE,
  PerioSite.V_DISTAL,
  PerioSite.L_MESIAL,
  PerioSite.L_MIDDLE,
  PerioSite.L_DISTAL,
];

const FINDINGS: Array<[number, ToothSurface, FindingType, FindingStatus]> = [
  [16, ToothSurface.OCCLUSAL, FindingType.CARIES, FindingStatus.EXISTING],
  [16, ToothSurface.MESIAL, FindingType.CARIES, FindingStatus.EXISTING],
  [14, ToothSurface.OCCLUSAL, FindingType.RESTORATION, FindingStatus.EXISTING],
  [24, ToothSurface.DISTAL, FindingType.CARIES, FindingStatus.EXISTING],
  [26, ToothSurface.OCCLUSAL, FindingType.SEALANT, FindingStatus.EXISTING],
  [21, ToothSurface.WHOLE, FindingType.IMPLANT, FindingStatus.EXISTING],
  [36, ToothSurface.OCCLUSAL, FindingType.RESTORATION, FindingStatus.EXISTING],
  [36, ToothSurface.MESIAL, FindingType.RESTORATION, FindingStatus.EXISTING],
  [37, ToothSurface.WHOLE, FindingType.ENDODONTICS_DONE, FindingStatus.EXISTING],
  [46, ToothSurface.WHOLE, FindingType.ENDODONTICS_REQUIRED, FindingStatus.PLANNED],
  [46, ToothSurface.OCCLUSAL, FindingType.CARIES, FindingStatus.EXISTING],
  [45, ToothSurface.WHOLE, FindingType.PROSTHESIS_FIXED, FindingStatus.EXISTING],
  [38, ToothSurface.WHOLE, FindingType.EXTRACTION, FindingStatus.PLANNED],
  [48, ToothSurface.WHOLE, FindingType.EXTRACTION, FindingStatus.PLANNED],
  [35, ToothSurface.WHOLE, FindingType.PROSTHESIS_REMOVABLE, FindingStatus.EXISTING],
];

/** Catálogo clínico: medicamentos y plantillas de consentimiento. Idempotente. */
export async function seedClinicalCatalog(
  { prisma }: SeedContext,
  adminEmail = 'admin@sigo.test',
): Promise<void> {
  for (const medication of MEDICATIONS) {
    await prisma.medication.upsert({
      where: { name: medication.name },
      update: {},
      create: medication,
    });
  }
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) return;
  const procedures = await prisma.procedure.findMany({ where: { requiresConsent: true } });
  for (const procedure of procedures) {
    const exists = await prisma.consentTemplate.findFirst({ where: { procedureId: procedure.id } });
    if (exists) continue;
    await prisma.consentTemplate.create({
      data: {
        procedureId: procedure.id,
        version: 1,
        title: `Consentimiento informado: ${procedure.name}`,
        body: DEFAULT_CONSENT_BODY,
        createdById: admin.id,
      },
    });
  }
}

/** Historia clínica de demostración de Carlos Mendoza (odontograma, periodontograma, nota, plan). */
export async function seedClinicalDemo({ prisma: client, crypto }: SeedContext): Promise<void> {
  const prisma = client;
  const dentist = await prisma.user.findUnique({ where: { email: 'odontologo@sigo.test' } });
  const assistant = await prisma.user.findUnique({ where: { email: 'asistente@sigo.test' } });
  const patient = await prisma.patient.findFirst({
    where: { documentHash: crypto.blindIndex('0912345678') },
  });
  if (!dentist || !assistant || !patient) return;
  if (await prisma.odontogram.findUnique({ where: { patientId: patient.id } })) return;

  // Todo o nada: si algo falla no quedan datos a medias y el seed puede repetirse.
  await client.$transaction(
    async (prisma) => {
      const odontogram = await prisma.odontogram.create({ data: { patientId: patient.id } });
      await prisma.odontogramFinding.createMany({
        data: FINDINGS.map(([toothCode, surface, type, status]) => ({
          odontogramId: odontogram.id,
          toothCode,
          surface,
          type,
          status,
          createdById: dentist.id,
        })),
      });

      // Periodontograma completo (28 dientes × 6 puntos) para medir el rendimiento con datos realistas
      const random = lcg(2026);
      const permanent = [
        ...archTeeth('UPPER', 'PERMANENT'),
        ...archTeeth('LOWER', 'PERMANENT'),
      ].filter((code) => code % 10 !== 8);
      const chart = await prisma.perioChart.create({
        data: {
          patientId: patient.id,
          examinerId: dentist.id,
          sites: {
            create: permanent.flatMap((toothCode) =>
              SITES.map((site) => ({
                toothCode,
                site,
                probingDepth: 2 + Math.floor(random() * 4),
                gingivalMargin: Math.floor(random() * 3) - (random() > 0.8 ? 1 : 0),
                bleeding: random() > 0.75,
              })),
            ),
          },
          teeth: {
            create: permanent.map((toothCode) => ({
              toothCode,
              furcation: random() > 0.92 ? 1 : 0,
              mobility: random() > 0.9 ? 1 : 0,
            })),
          },
        },
      });
      await prisma.perioChart.update({
        where: { id: chart.id },
        data: { finalizedAt: new Date() },
      });

      await prisma.vitalSigns.create({
        data: {
          patientId: patient.id,
          recordedById: assistant.id,
          systolic: 135,
          diastolic: 85,
          pulse: 78,
          temperatureC: 36.6,
          oxygenSaturation: 97,
          weightKg: 82.4,
        },
      });

      const noteId = randomUUID();
      const signedAt = new Date();
      const content = {
        patientId: patient.id,
        appointmentId: null,
        subjective:
          'Refiere dolor al masticar en el sector inferior derecho desde hace una semana.',
        objective: 'Caries profunda en 46, sensibilidad a la percusión. Sin edema.',
        assessment: 'Pulpitis irreversible sintomática del 46.',
        plan: 'Endodoncia del 46 y posterior corona. Control de anticoagulación previo.',
      };
      await prisma.evolutionNote.create({
        data: {
          id: noteId,
          ...content,
          authorId: dentist.id,
          lockAt: computeLockAt(signedAt, 24),
          signedAt,
          signedById: dentist.id,
          contentHash: signatureHash({
            kind: 'NOTE',
            entityId: noteId,
            content,
            signerId: dentist.id,
            signedAt,
          }),
        },
      });

      const [rest2, endo2, coro] = await Promise.all(
        ['REST-02', 'ENDO-02', 'CORO-01'].map((code) =>
          prisma.procedure.findUnique({ where: { code } }),
        ),
      );
      if (!rest2 || !endo2 || !coro) return;
      const plan = await prisma.treatmentPlan.create({
        data: {
          patientId: patient.id,
          title: 'Rehabilitación sector inferior derecho',
          createdById: dentist.id,
          phases: {
            create: [
              { name: 'Fase 1 — Urgencia', position: 1 },
              { name: 'Fase 2 — Restauración', position: 2 },
            ],
          },
        },
        include: { phases: true },
      });
      const phase = (position: number) => plan.phases.find((p) => p.position === position)!.id;
      const specs = [
        { position: 1, procedure: endo2, toothCode: 46, sessionNumber: 1 },
        { position: 2, procedure: rest2, toothCode: 16, sessionNumber: 2 },
        { position: 2, procedure: coro, toothCode: 46, sessionNumber: 3 },
      ];
      const items = [];
      for (const spec of specs) {
        items.push(
          await prisma.treatmentItem.create({
            data: {
              phaseId: phase(spec.position),
              procedureId: spec.procedure.id,
              toothCode: spec.toothCode,
              sessionNumber: spec.sessionNumber,
              fee: spec.procedure.basePrice,
              labCost: spec.procedure.labCost,
            },
          }),
        );
      }

      // Presupuesto v1 sin descuento
      const phaseName = (position: number) =>
        plan.phases.find((p) => p.position === position)!.name;
      const lines = items.map((item, index) => ({
        itemId: item.id,
        phasePosition: specs[index].position,
        phaseName: phaseName(specs[index].position),
        feeCents: toCents(Number(item.fee)),
        labCents: toCents(Number(item.labCost)),
      }));
      const totals = calculateBudget(lines, 0);
      await prisma.budget.create({
        data: {
          planId: plan.id,
          version: 1,
          subtotalFees: fromCents(totals.feesCents),
          subtotalLab: fromCents(totals.labCents),
          total: fromCents(totals.totalCents),
          createdById: dentist.id,
          lines: {
            create: items.map((item, index) => ({
              itemId: item.id,
              phaseName: lines[index].phaseName,
              phasePosition: lines[index].phasePosition,
              description: `${specs[index].procedure.name} — diente ${specs[index].toothCode}`,
              toothCode: specs[index].toothCode,
              fee: item.fee,
              labCost: item.labCost,
            })),
          },
        },
      });
    },
    { timeout: 120_000 },
  );
}
