import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertRulesService } from '../../catalog/alert-rules/alert-rules.service';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateAlerts } from '../alerts/alert-evaluator';
import type { MedicalHistoryDto } from './dto/medical-history.dto';

/** Quita espacios y vacíos, y elimina repetidos sin distinguir mayúsculas. */
export function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      result.push(value);
    }
  }
  return result;
}

@Injectable()
export class MedicalHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertRules: AlertRulesService,
  ) {}

  async get(patientId: string) {
    await this.assertPatient(patientId);
    const history = await this.prisma.db.medicalHistory.findUnique({ where: { patientId } });
    return this.withAlerts(history);
  }

  /** Crea o actualiza la anamnesis (RF-02). Registrarla habilita la atención clínica. */
  async upsert(patientId: string, dto: MedicalHistoryDto, userId: string) {
    await this.assertPatient(patientId);
    const data = {
      systemicDiseases: cleanList(dto.systemicDiseases),
      drugAllergies: cleanList(dto.drugAllergies),
      coagulopathies: cleanList(dto.coagulopathies),
      surgicalHistory: dto.surgicalHistory?.trim() || null,
      currentMedication: dto.currentMedication?.trim() || null,
      anticoagulated: dto.anticoagulated ?? false,
      updatedById: userId,
    };
    const history = await this.prisma.db.medicalHistory.upsert({
      where: { patientId },
      create: { patientId, ...data },
      update: data,
    });
    return this.withAlerts(history);
  }

  private async withAlerts(
    history: Awaited<ReturnType<PrismaService['db']['medicalHistory']['findUnique']>>,
  ) {
    const rules = await this.alertRules.list(true);
    return { history, alerts: evaluateAlerts(history, rules) };
  }

  private async assertPatient(patientId: string): Promise<void> {
    const exists = await this.prisma.db.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Paciente no encontrado');
  }
}
