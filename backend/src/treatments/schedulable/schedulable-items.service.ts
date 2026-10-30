import { Injectable } from '@nestjs/common';
import { TreatmentItemStatus } from '@prisma/client';
import { ClinicalLookupService } from '../../clinical/shared/clinical-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tareas agendables (RF-08): ítems que el paciente ya aprobó y esperan una cita.
 * Recepción las ve para agendar, sin acceder al resto del contenido clínico ni a los importes.
 */
@Injectable()
export class SchedulableItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const items = await this.prisma.db.treatmentItem.findMany({
      where: {
        phase: { plan: { patientId } },
        status: { in: [TreatmentItemStatus.APPROVED, TreatmentItemStatus.SCHEDULED] },
      },
      orderBy: [{ phase: { position: 'asc' } }, { sessionNumber: 'asc' }, { createdAt: 'asc' }],
      include: {
        procedure: { select: { id: true, code: true, name: true, durationMinutes: true } },
        phase: { select: { name: true, plan: { select: { title: true } } } },
        appointment: { select: { id: true, startAt: true, status: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      procedure: item.procedure,
      toothCode: item.toothCode,
      sessionNumber: item.sessionNumber,
      status: item.status,
      planTitle: item.phase.plan.title,
      phaseName: item.phase.name,
      appointment: item.appointment,
    }));
  }
}
