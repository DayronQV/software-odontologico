import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OdontogramDentition, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { validateFindingTarget } from '../domain/finding-catalog';
import { isPermanentTooth } from '../domain/tooth-notation';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import type { CreateFindingDto, RemoveFindingDto, UpdateFindingDto } from './dto/odontogram.dto';

type FindingRow = Prisma.OdontogramFindingGetPayload<object>;

function toView(row: FindingRow, names: Map<string, string>) {
  return {
    id: row.id,
    toothCode: row.toothCode,
    surface: row.surface,
    type: row.type,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    createdBy: names.get(row.createdById) ?? null,
    removedAt: row.removedAt,
    removedBy: row.removedById ? (names.get(row.removedById) ?? null) : null,
    removalReason: row.removalReason,
    replacesId: row.replacesId,
  };
}

/** Odontograma del paciente (RF-03): hallazgos por diente y superficie con historial de cambios. */
@Injectable()
export class OdontogramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  /** Estado actual, o el que tenía en la fecha `at`. Sin odontograma devuelve uno vacío (sin crearlo). */
  async get(patientId: string, at?: Date) {
    await this.lookup.assertPatient(patientId);
    const odontogram = await this.prisma.db.odontogram.findUnique({ where: { patientId } });
    const findings = odontogram
      ? await this.prisma.db.odontogramFinding.findMany({
          where: {
            odontogramId: odontogram.id,
            ...(at
              ? { createdAt: { lte: at }, OR: [{ removedAt: null }, { removedAt: { gt: at } }] }
              : { removedAt: null }),
          },
          orderBy: [{ toothCode: 'asc' }, { createdAt: 'asc' }],
        })
      : [];
    const names = await this.lookup.userNames(findings.map((f) => f.createdById));
    return {
      patientId,
      dentition: odontogram?.dentition ?? OdontogramDentition.PERMANENT,
      asOf: at?.toISOString() ?? null,
      findings: findings.map((f) => toView(f, names)),
    };
  }

  async setDentition(patientId: string, dentition: OdontogramDentition) {
    await this.lookup.assertPatient(patientId);
    await this.prisma.db.odontogram.upsert({
      where: { patientId },
      create: { patientId, dentition },
      update: { dentition },
    });
    return this.get(patientId);
  }

  async addFinding(patientId: string, dto: CreateFindingDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const problem = validateFindingTarget(dto.toothCode, dto.surface, dto.type);
    if (problem) throw new BadRequestException(problem);

    const odontogram = await this.prisma.db.odontogram.upsert({
      where: { patientId },
      create: { patientId },
      update: {},
    });
    this.assertToothMatchesDentition(dto.toothCode, odontogram.dentition);

    const duplicate = await this.prisma.db.odontogramFinding.findFirst({
      where: {
        odontogramId: odontogram.id,
        toothCode: dto.toothCode,
        surface: dto.surface,
        type: dto.type,
        removedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Ese hallazgo ya está registrado en el diente');

    const created = await this.prisma.db.odontogramFinding.create({
      data: {
        odontogramId: odontogram.id,
        toothCode: dto.toothCode,
        surface: dto.surface,
        type: dto.type,
        status: dto.status,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
      },
    });
    return toView(created, await this.lookup.userNames([created.createdById]));
  }

  async updateFinding(patientId: string, findingId: string, dto: UpdateFindingDto, user: AuthUser) {
    const current = await this.findActive(patientId, findingId);
    const next = {
      type: dto.type ?? current.type,
      status: dto.status ?? current.status,
      notes: dto.notes === undefined ? current.notes : dto.notes.trim() || null,
    };
    if (
      next.type === current.type &&
      next.status === current.status &&
      next.notes === current.notes
    ) {
      throw new BadRequestException('No hay cambios que registrar');
    }
    const problem = validateFindingTarget(current.toothCode, current.surface, next.type);
    if (problem) throw new BadRequestException(problem);

    const created = await this.prisma.db.$transaction(async (tx) => {
      await tx.odontogramFinding.update({
        where: { id: current.id },
        data: { removedAt: new Date(), removedById: user.id, removalReason: 'Actualizado' },
      });
      return tx.odontogramFinding.create({
        data: {
          odontogramId: current.odontogramId,
          toothCode: current.toothCode,
          surface: current.surface,
          type: next.type,
          status: next.status,
          notes: next.notes,
          createdById: user.id,
          replacesId: current.id,
        },
      });
    });
    return toView(created, await this.lookup.userNames([created.createdById]));
  }

  /** Quita (cierra) un hallazgo registrado por error. Sigue visible en el historial. */
  async removeFinding(patientId: string, findingId: string, dto: RemoveFindingDto, user: AuthUser) {
    const current = await this.findActive(patientId, findingId);
    await this.prisma.db.odontogramFinding.update({
      where: { id: current.id },
      data: { removedAt: new Date(), removedById: user.id, removalReason: dto.reason.trim() },
    });
    return { id: current.id, removed: true };
  }

  /** Historial completo de cambios (quién y cuándo), opcionalmente de un solo diente. */
  async history(patientId: string, toothCode?: number) {
    await this.lookup.assertPatient(patientId);
    const odontogram = await this.prisma.db.odontogram.findUnique({ where: { patientId } });
    if (!odontogram) return [];
    const rows = await this.prisma.db.odontogramFinding.findMany({
      where: { odontogramId: odontogram.id, ...(toothCode && { toothCode }) },
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.lookup.userNames(rows.flatMap((r) => [r.createdById, r.removedById]));
    return rows.map((row) => toView(row, names));
  }

  private async findActive(patientId: string, findingId: string): Promise<FindingRow> {
    const finding = await this.prisma.db.odontogramFinding.findFirst({
      where: { id: findingId, odontogram: { patientId } },
    });
    if (!finding) throw new NotFoundException('Hallazgo no encontrado');
    if (finding.removedAt) throw new ConflictException('El hallazgo ya fue cerrado');
    return finding;
  }

  private assertToothMatchesDentition(toothCode: number, dentition: OdontogramDentition): void {
    const permanent = isPermanentTooth(toothCode);
    if (dentition === OdontogramDentition.PERMANENT && !permanent) {
      throw new BadRequestException('El paciente tiene dentición permanente: cambie a temporal o mixta');
    }
    if (dentition === OdontogramDentition.PRIMARY && permanent) {
      throw new BadRequestException('El paciente tiene dentición temporal: cambie a permanente o mixta');
    }
  }
}
