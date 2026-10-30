import { Injectable } from '@nestjs/common';
import { AppointmentStatus, NoteKind, SigningStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';

export type TimelineEventType =
  | 'NOTE'
  | 'PROCEDURE'
  | 'PRESCRIPTION'
  | 'CONSENT'
  | 'ATTACHMENT'
  | 'VITALS'
  | 'PERIO'
  | 'ODONTOGRAM'
  | 'APPOINTMENT'
  | 'BUDGET';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  at: Date;
  title: string;
  detail: string | null;
  author: string | null;
}

const PER_SOURCE = 40;
const MAX_EVENTS = 120;
const excerpt = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Línea de tiempo cronológica de la historia clínica (RF-05, expediente). */
@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async get(patientId: string): Promise<TimelineEvent[]> {
    await this.lookup.assertPatient(patientId);
    const db = this.prisma.db;
    const recent = { orderBy: { createdAt: 'desc' as const }, take: PER_SOURCE };
    const [notes, records, prescriptions, consents, attachments, vitals, perio, findings, visits, approvals] =
      await Promise.all([
        db.evolutionNote.findMany({ where: { patientId }, ...recent }),
        db.procedureRecord.findMany({
          where: { patientId },
          orderBy: { performedAt: 'desc' },
          take: PER_SOURCE,
          include: { procedure: { select: { name: true } } },
        }),
        db.prescription.findMany({ where: { patientId }, orderBy: { issuedAt: 'desc' }, take: PER_SOURCE }),
        db.patientConsent.findMany({
          where: { patientId, signing: { status: SigningStatus.SIGNED } },
          ...recent,
          include: { procedure: { select: { name: true } }, signing: { select: { signedAt: true, signerName: true } } },
        }),
        db.attachment.findMany({ where: { patientId }, ...recent }),
        db.vitalSigns.findMany({ where: { patientId }, orderBy: { recordedAt: 'desc' }, take: PER_SOURCE }),
        db.perioChart.findMany({ where: { patientId }, orderBy: { examinedAt: 'desc' }, take: PER_SOURCE }),
        db.odontogramFinding.findMany({
          where: { odontogram: { patientId } },
          ...recent,
        }),
        db.appointment.findMany({
          where: { patientId, status: AppointmentStatus.ATTENDED },
          orderBy: { startAt: 'desc' },
          take: PER_SOURCE,
          include: { procedures: { include: { procedure: { select: { name: true } } } } },
        }),
        db.budgetApproval.findMany({
          where: { budget: { plan: { patientId } }, signing: { status: SigningStatus.SIGNED } },
          ...recent,
          include: { signing: { select: { signedAt: true } }, budget: { select: { version: true } } },
        }),
      ]);

    const names = await this.lookup.userNames([
      ...notes.map((n) => n.authorId),
      ...records.map((r) => r.performedById),
      ...prescriptions.map((p) => p.prescriberId),
      ...consents.map((c) => c.professionalId),
      ...attachments.map((a) => a.uploadedById),
      ...vitals.map((v) => v.recordedById),
      ...perio.map((p) => p.examinerId),
      ...findings.map((f) => f.createdById),
    ]);
    const who = (id: string) => names.get(id) ?? null;

    const events: TimelineEvent[] = [
      ...notes.map((n) => ({
        id: n.id,
        type: 'NOTE' as const,
        at: n.createdAt,
        title: n.kind === NoteKind.ASSISTANT ? 'Nota clínica del asistente' : 'Nota de evolución (SOEP)',
        detail: excerpt(n.assessment),
        author: who(n.authorId),
      })),
      ...records.map((r) => ({
        id: r.id,
        type: 'PROCEDURE' as const,
        at: r.performedAt,
        title: `Procedimiento realizado: ${r.procedure.name}`,
        detail: r.toothCode ? `Diente ${r.toothCode}` : null,
        author: who(r.performedById),
      })),
      ...prescriptions.map((p) => ({
        id: p.id,
        type: 'PRESCRIPTION' as const,
        at: p.issuedAt,
        title: `Receta RX-${String(p.number).padStart(6, '0')}${p.status === 'VOIDED' ? ' (anulada)' : ''}`,
        detail: null,
        author: who(p.prescriberId),
      })),
      ...consents.map((c) => ({
        id: c.id,
        type: 'CONSENT' as const,
        at: c.signing.signedAt ?? c.createdAt,
        title: `Consentimiento firmado: ${c.procedure.name}`,
        detail: c.signing.signerName ? `Firmó ${c.signing.signerName}` : null,
        author: who(c.professionalId),
      })),
      ...attachments.map((a) => ({
        id: a.id,
        type: 'ATTACHMENT' as const,
        at: a.createdAt,
        title: `Adjunto: ${a.filename}`,
        detail: a.description,
        author: who(a.uploadedById),
      })),
      ...vitals.map((v) => ({
        id: v.id,
        type: 'VITALS' as const,
        at: v.recordedAt,
        title: 'Signos vitales',
        detail:
          [v.systolic && v.diastolic ? `PA ${v.systolic}/${v.diastolic}` : null, v.pulse ? `FC ${v.pulse}` : null]
            .filter(Boolean)
            .join(' · ') || null,
        author: who(v.recordedById),
      })),
      ...perio.map((p) => ({
        id: p.id,
        type: 'PERIO' as const,
        at: p.examinedAt,
        title: 'Examen periodontal',
        detail: p.finalizedAt ? 'Finalizado' : 'Borrador',
        author: who(p.examinerId),
      })),
      ...findings.map((f) => ({
        id: f.id,
        type: 'ODONTOGRAM' as const,
        at: f.createdAt,
        title: `Odontograma: hallazgo en diente ${f.toothCode}`,
        detail: `${f.type} · ${f.status}`,
        author: who(f.createdById),
      })),
      ...visits.map((a) => ({
        id: a.id,
        type: 'APPOINTMENT' as const,
        at: a.startAt,
        title: 'Cita atendida',
        detail: a.procedures.map((p) => p.procedure.name).join(', ') || null,
        author: null,
      })),
      ...approvals.map((a) => ({
        id: a.id,
        type: 'BUDGET' as const,
        at: a.signing.signedAt ?? a.createdAt,
        title: `Presupuesto v${a.budget.version} aprobado`,
        detail: `${a.itemIds.length} ítem(s)`,
        author: null,
      })),
    ];
    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MAX_EVENTS);
  }
}
