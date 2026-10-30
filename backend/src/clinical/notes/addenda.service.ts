import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { isNoteLocked } from '../domain/note-lock';
import { signatureHash } from '../domain/signature';
import { ReauthService } from '../shared/reauth.service';
import type { CreateAddendumDto } from './dto/notes.dto';

/**
 * Adendas firmadas: la única forma de corregir una nota bloqueada o un procedimiento realizado
 * (RF-05, RN-01). Una adenda nunca se edita ni se borra (trigger SQL).
 */
@Injectable()
export class AddendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reauth: ReauthService,
  ) {}

  async addToNote(noteId: string, dto: CreateAddendumDto, user: AuthUser) {
    const note = await this.prisma.db.evolutionNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.authorId !== user.id) {
      throw new ForbiddenException('Solo el profesional que escribió la nota puede añadir una adenda');
    }
    if (!isNoteLocked(note)) {
      throw new ConflictException('La nota aún es editable: modifíquela directamente');
    }
    await this.reauth.confirm(user.id, dto.password);
    return this.create({ patientId: note.patientId, noteId }, dto.content, user);
  }

  async addToProcedureRecord(recordId: string, dto: CreateAddendumDto, user: AuthUser) {
    const record = await this.prisma.db.procedureRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Procedimiento no encontrado');
    if (record.performedById !== user.id) {
      throw new ForbiddenException('Solo el profesional que realizó el procedimiento puede corregirlo');
    }
    await this.reauth.confirm(user.id, dto.password);
    return this.create({ patientId: record.patientId, procedureRecordId: recordId }, dto.content, user);
  }

  private async create(
    target: { patientId: string; noteId?: string; procedureRecordId?: string },
    content: string,
    user: AuthUser,
  ) {
    const signedAt = new Date();
    const text = content.trim();
    const id = randomUUID();
    const contentHash = signatureHash({
      kind: 'ADDENDUM',
      entityId: id,
      content: { ...target, text },
      signerId: user.id,
      signedAt,
    });
    const addendum = await this.prisma.db.clinicalAddendum.create({
      data: { id, ...target, authorId: user.id, content: text, signedAt, contentHash },
    });
    return {
      id: addendum.id,
      noteId: addendum.noteId,
      procedureRecordId: addendum.procedureRecordId,
      content: addendum.content,
      author: user.fullName,
      signedAt: addendum.signedAt,
      contentHash: addendum.contentHash,
    };
  }
}
