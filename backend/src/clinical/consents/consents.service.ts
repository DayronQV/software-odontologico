import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, Role, SigningPurpose, SigningRequest, SigningStatus } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import { formatLocalDateTime } from '../../common/local-time';
import type { AuthUser } from '../../common/types';
import { BlobStorageService } from '../../files/blob-storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Tx } from '../../prisma/transaction';
import { signingView, SigningService } from '../../signing/signing.service';
import type { PreparedDocument, SigningEvidence, SigningHandler } from '../../signing/signing.types';
import { sha256 } from '../domain/signature';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import { renderConsentPdf } from './consent-pdf';
import { CONSENT_VALIDITY_DAYS, renderConsentText } from './consent-text';
import { ConsentTemplatesService } from './consent-templates.service';
import type { CreateConsentDto } from './dto/consent.dto';

const CONSENT_INCLUDE = {
  procedure: { select: { code: true, name: true } },
  template: { select: { title: true, version: true } },
  signing: true,
} satisfies Prisma.PatientConsentInclude;

type ConsentRow = Prisma.PatientConsentGetPayload<{ include: typeof CONSENT_INCLUDE }>;

/** Consentimiento informado por procedimiento (RF-06): crea el documento y lo firma el paciente. */
@Injectable()
export class ConsentsService implements OnModuleInit, SigningHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly templates: ConsentTemplatesService,
    private readonly signing: SigningService,
    private readonly settings: SettingsService,
    private readonly blobs: BlobStorageService,
  ) {}

  onModuleInit(): void {
    this.signing.registerHandler(SigningPurpose.CONSENT, this);
  }

  // ----------------------------------------------------------------- consultas

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const rows = await this.prisma.db.patientConsent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: CONSENT_INCLUDE,
    });
    const names = await this.lookup.userNames(rows.map((r) => r.professionalId));
    return rows.map((row) => this.toView(row, names));
  }

  async get(consentId: string) {
    const row = await this.findOne(consentId);
    return this.toView(row, await this.lookup.userNames([row.professionalId]));
  }

  // ----------------------------------------------------------------- creación

  async create(patientId: string, dto: CreateConsentDto, user: AuthUser) {
    const patient = await this.lookup.assertPatient(patientId);
    const procedure = await this.prisma.db.procedure.findUnique({ where: { id: dto.procedureId } });
    if (!procedure) throw new NotFoundException('Procedimiento no encontrado');
    const template = await this.templates.findActive(dto.procedureId);
    if (!template) {
      throw new ConflictException('Este procedimiento no tiene plantilla de consentimiento vigente');
    }

    // Si ya hay uno pendiente para lo mismo, se reutiliza (no se acumulan borradores).
    const pending = await this.prisma.db.patientConsent.findFirst({
      where: {
        patientId,
        procedureId: dto.procedureId,
        treatmentItemId: dto.treatmentItemId ?? null,
        signing: { status: SigningStatus.PENDING },
      },
      include: CONSENT_INCLUDE,
    });
    if (pending) return this.toView(pending, await this.lookup.userNames([pending.professionalId]));

    const professional = await this.resolveResponsible(dto, user);
    const clinic = await this.settings.get();
    const text = renderConsentText(template.body, {
      clinica: clinic.clinicName,
      paciente: `${patient.firstName} ${patient.lastName}`,
      procedimiento: procedure.name,
      profesional: professional.fullName,
      fecha: formatLocalDateTime(new Date(), clinic.timezone),
      diente: dto.toothCode ? `(diente ${dto.toothCode})` : '',
    });

    const created = await this.prisma.db.$transaction(async (tx) => {
      const request = await this.signing.create(tx, patientId, SigningPurpose.CONSENT, user.id);
      return tx.patientConsent.create({
        data: {
          patientId,
          templateId: template.id,
          procedureId: procedure.id,
          professionalId: professional.id,
          appointmentId: dto.appointmentId ?? null,
          treatmentItemId: dto.treatmentItemId ?? null,
          renderedText: text,
          signingId: request.id,
          createdById: user.id,
        },
        include: CONSENT_INCLUDE,
      });
    });
    return this.toView(created, new Map([[professional.id, professional.fullName]]));
  }

  // ------------------------------------------------- requisito para registrar el acto

  /**
   * Un procedimiento marcado "requiere consentimiento" no puede registrarse como realizado hasta
   * que exista un consentimiento firmado y vigente para ese paciente (RF-06).
   */
  async assertSigned(patientId: string, procedureId: string): Promise<void> {
    const procedure = await this.prisma.db.procedure.findUnique({
      where: { id: procedureId },
      select: { requiresConsent: true, name: true },
    });
    if (!procedure?.requiresConsent) return;
    const since = new Date(Date.now() - CONSENT_VALIDITY_DAYS * 86_400_000);
    const signed = await this.prisma.db.patientConsent.findFirst({
      where: {
        patientId,
        procedureId,
        signing: { status: SigningStatus.SIGNED, signedAt: { gte: since } },
      },
      select: { id: true },
    });
    if (!signed) {
      throw new ConflictException(
        `«${procedure.name}» requiere un consentimiento informado firmado antes de realizarse`,
      );
    }
  }

  // ------------------------------------------------------------------------- PDF

  /** PDF firmado (verificando su integridad) o, si aún no se firma, una vista previa. */
  async pdf(consentId: string): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.findOne(consentId);
    const filename = `consentimiento-${row.id.slice(0, 8)}.pdf`;
    if (row.signing.status === SigningStatus.SIGNED && row.pdfKey) {
      const buffer = await this.blobs.get(row.pdfKey);
      if (row.pdfHash && sha256(buffer) !== row.pdfHash) {
        throw new InternalServerErrorException('El documento almacenado no coincide con su huella de integridad');
      }
      return { buffer, filename };
    }
    return { buffer: await this.draw(row, undefined), filename };
  }

  // -------------------------------------------------------- SigningHandler (firma)

  async prepare(request: SigningRequest, evidence: SigningEvidence): Promise<PreparedDocument> {
    const row = await this.prisma.db.patientConsent.findUniqueOrThrow({
      where: { signingId: request.id },
      include: CONSENT_INCLUDE,
    });
    const buffer = await this.draw(row, evidence);
    const key = `consents/${row.patientId}/${row.id}.pdf`;
    await this.blobs.put(key, buffer, 'application/pdf');
    return { key, hash: sha256(buffer) };
  }

  async commit(
    request: SigningRequest,
    _evidence: SigningEvidence,
    document: PreparedDocument,
    tx: Tx,
  ): Promise<void> {
    await tx.patientConsent.update({
      where: { signingId: request.id },
      data: { pdfKey: document.key, pdfHash: document.hash },
    });
  }

  // ----------------------------------------------------------------------- interno

  private async draw(row: ConsentRow, evidence: SigningEvidence | undefined): Promise<Buffer> {
    const [clinic, patient, names] = await Promise.all([
      this.settings.get(),
      this.lookup.assertPatient(row.patientId),
      this.lookup.userNames([row.professionalId]),
    ]);
    return renderConsentPdf({
      clinicName: clinic.clinicName,
      timezone: clinic.timezone,
      title: row.template.title,
      version: row.template.version,
      text: row.renderedText,
      patientName: `${patient.firstName} ${patient.lastName}`,
      professionalName: names.get(row.professionalId) ?? '—',
      evidence,
    });
  }

  private async findOne(consentId: string): Promise<ConsentRow> {
    const row = await this.prisma.db.patientConsent.findUnique({
      where: { id: consentId },
      include: CONSENT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Consentimiento no encontrado');
    return row;
  }

  /** Quién responde clínicamente: el odontólogo que crea, el indicado o el de la cita. */
  private async resolveResponsible(dto: CreateConsentDto, user: AuthUser) {
    let userId: string | undefined = user.role === Role.ODONTOLOGO ? user.id : dto.professionalId;
    if (!userId && dto.appointmentId) {
      const appointment = await this.prisma.db.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: { professional: { select: { userId: true } } },
      });
      userId = appointment?.professional.userId;
    }
    if (!userId) throw new BadRequestException('Indique el odontólogo responsable del procedimiento');
    const dentist = await this.prisma.db.user.findFirst({
      where: { id: userId, role: Role.ODONTOLOGO, active: true },
      select: { id: true, fullName: true },
    });
    if (!dentist) throw new BadRequestException('El responsable debe ser un odontólogo activo');
    return dentist;
  }

  private toView(row: ConsentRow, names: Map<string, string>) {
    return {
      id: row.id,
      patientId: row.patientId,
      procedure: row.procedure,
      template: row.template,
      professional: names.get(row.professionalId) ?? null,
      treatmentItemId: row.treatmentItemId,
      text: row.renderedText,
      createdAt: row.createdAt,
      pdfHash: row.pdfHash,
      hasPdf: !!row.pdfKey,
      signing: signingView(row.signing),
    };
  }
}
