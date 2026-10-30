import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import type { CreateVitalSignsDto } from './dto/notes.dto';

/** Signos vitales que registra el asistente antes de la atención. Solo se anexan, no se editan. */
@Injectable()
export class VitalSignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const rows = await this.prisma.db.vitalSigns.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
    const names = await this.lookup.userNames(rows.map((r) => r.recordedById));
    return rows.map((row) => this.toView(row, names));
  }

  async create(patientId: string, dto: CreateVitalSignsDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    const { appointmentId, notes, ...measures } = dto;
    if (Object.values(measures).every((v) => v === undefined)) {
      throw new BadRequestException('Registre al menos una medición');
    }
    if (
      measures.systolic !== undefined &&
      measures.diastolic !== undefined &&
      measures.diastolic >= measures.systolic
    ) {
      throw new BadRequestException('La presión diastólica debe ser menor que la sistólica');
    }
    const row = await this.prisma.db.vitalSigns.create({
      data: { patientId, appointmentId, notes: notes?.trim() || null, recordedById: user.id, ...measures },
    });
    return this.toView(row, new Map([[user.id, user.fullName]]));
  }

  private toView(
    row: Awaited<ReturnType<PrismaService['db']['vitalSigns']['create']>>,
    names: Map<string, string>,
  ) {
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      recordedAt: row.recordedAt,
      recordedBy: names.get(row.recordedById) ?? null,
      systolic: row.systolic,
      diastolic: row.diastolic,
      pulse: row.pulse,
      temperatureC: row.temperatureC === null ? null : Number(row.temperatureC),
      oxygenSaturation: row.oxygenSaturation,
      weightKg: row.weightKg === null ? null : Number(row.weightKg),
      notes: row.notes,
    };
  }
}
