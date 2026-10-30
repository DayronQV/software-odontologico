import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NoteKind, Prisma, Role } from '@prisma/client';
import { SettingsService } from '../../catalog/settings/settings.service';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { computeLockAt, isNoteLocked } from '../domain/note-lock';
import { signatureHash, verifySignatureHash } from '../domain/signature';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import { ReauthService } from '../shared/reauth.service';
import type { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';

type NoteWithAddenda = Prisma.EvolutionNoteGetPayload<{ include: { addenda: true } }>;

/** Contenido que se firma: los 4 campos SOEP y el contexto clínico. */
export function noteContent(note: {
  patientId: string;
  appointmentId: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}) {
  return {
    patientId: note.patientId,
    appointmentId: note.appointmentId,
    subjective: note.subjective,
    objective: note.objective,
    assessment: note.assessment,
    plan: note.plan,
  };
}

/** Evolución clínica (RF-05): notas SOEP del odontólogo y notas del asistente, con bloqueo y firma. */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
    private readonly settings: SettingsService,
    private readonly reauth: ReauthService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const notes = await this.prisma.db.evolutionNote.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { addenda: { orderBy: { signedAt: 'asc' } } },
    });
    const names = await this.lookup.userNames(
      notes.flatMap((n) => [n.authorId, n.signedById, ...n.addenda.map((a) => a.authorId)]),
    );
    return notes.map((note) => this.toView(note, names));
  }

  async create(patientId: string, dto: CreateNoteDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const { noteLockHours } = await this.settings.get();
    const now = new Date();
    const note = await this.prisma.db.evolutionNote.create({
      data: {
        patientId,
        appointmentId: dto.appointmentId ?? null,
        authorId: user.id,
        kind: user.role === Role.ASISTENTE ? NoteKind.ASSISTANT : NoteKind.SOEP,
        subjective: dto.subjective.trim(),
        objective: dto.objective.trim(),
        assessment: dto.assessment.trim(),
        plan: dto.plan.trim(),
        lockAt: computeLockAt(now, noteLockHours),
      },
      include: { addenda: true },
    });
    return this.toView(note, await this.lookup.userNames([note.authorId]));
  }

  /** Solo el autor edita, y solo dentro del plazo. Editar una nota firmada anula su firma. */
  async update(noteId: string, dto: UpdateNoteDto, user: AuthUser) {
    const note = await this.findOwn(noteId, user);
    if (isNoteLocked(note)) {
      throw new ConflictException('La nota está bloqueada: corríjala con una adenda firmada');
    }
    const updated = await this.prisma.db.evolutionNote.update({
      where: { id: noteId },
      data: {
        subjective: dto.subjective?.trim(),
        objective: dto.objective?.trim(),
        assessment: dto.assessment?.trim(),
        plan: dto.plan?.trim(),
        // El contenido cambió: la firma anterior ya no corresponde.
        signedAt: null,
        signedById: null,
        contentHash: null,
      },
      include: { addenda: true },
    });
    return this.toView(updated, await this.lookup.userNames([updated.authorId]));
  }

  /** Firma del profesional: reautenticación + sello de tiempo + hash SHA-256 del contenido. */
  async sign(noteId: string, password: string, user: AuthUser) {
    const note = await this.findOwn(noteId, user);
    if (note.kind !== NoteKind.SOEP) {
      throw new ForbiddenException('Solo las notas SOEP del odontólogo se firman');
    }
    if (note.signedAt) throw new ConflictException('La nota ya está firmada');
    await this.reauth.confirm(user.id, password);

    const signedAt = new Date();
    const contentHash = signatureHash({
      kind: 'NOTE',
      entityId: note.id,
      content: noteContent(note),
      signerId: user.id,
      signedAt,
    });
    const signed = await this.prisma.db.evolutionNote.update({
      where: { id: noteId },
      data: { signedAt, signedById: user.id, contentHash },
      include: { addenda: true },
    });
    return this.toView(signed, await this.lookup.userNames([signed.authorId, signed.signedById]));
  }

  /** Recalcula el hash del contenido actual y lo compara con el sellado al firmar. */
  async verify(patientId: string, noteId: string) {
    const note = await this.prisma.db.evolutionNote.findFirst({ where: { id: noteId, patientId } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    const valid =
      !!note.signedAt &&
      !!note.signedById &&
      verifySignatureHash(note.contentHash, {
        kind: 'NOTE',
        entityId: note.id,
        content: noteContent(note),
        signerId: note.signedById,
        signedAt: note.signedAt,
      });
    return { id: note.id, signed: !!note.signedAt, valid, contentHash: note.contentHash };
  }

  private async findOwn(noteId: string, user: AuthUser) {
    const note = await this.prisma.db.evolutionNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.authorId !== user.id) {
      throw new ForbiddenException('Solo el autor de la nota puede modificarla o firmarla');
    }
    return note;
  }

  private toView(note: NoteWithAddenda, names: Map<string, string>) {
    return {
      id: note.id,
      patientId: note.patientId,
      appointmentId: note.appointmentId,
      kind: note.kind,
      author: names.get(note.authorId) ?? null,
      authorId: note.authorId,
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
      createdAt: note.createdAt,
      lockAt: note.lockAt,
      locked: isNoteLocked(note),
      signed: !!note.signedAt,
      signedAt: note.signedAt,
      signedBy: note.signedById ? (names.get(note.signedById) ?? null) : null,
      contentHash: note.contentHash,
      addenda: note.addenda.map((a) => ({
        id: a.id,
        content: a.content,
        author: names.get(a.authorId) ?? null,
        signedAt: a.signedAt,
        contentHash: a.contentHash,
      })),
    };
  }
}
