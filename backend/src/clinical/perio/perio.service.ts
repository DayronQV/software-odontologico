import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  clinicalAttachmentLevel,
  compareSites,
  summarizePerio,
  type SiteReading,
} from '../domain/perio-calculations';
import { isValidToothCode } from '../domain/tooth-notation';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import type { SavePerioChartDto } from './dto/perio.dto';

const SITE_ORDER = ['V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL'];

/** Periodontograma (RF-04): 6 puntos por diente, NIC calculado, furca, movilidad y sangrado. */
@Injectable()
export class PerioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ClinicalLookupService,
  ) {}

  async list(patientId: string) {
    await this.lookup.assertPatient(patientId);
    const charts = await this.prisma.db.perioChart.findMany({
      where: { patientId },
      orderBy: { examinedAt: 'desc' },
      include: { sites: true },
    });
    const names = await this.lookup.userNames(charts.map((c) => c.examinerId));
    return charts.map((chart) => ({
      id: chart.id,
      examinedAt: chart.examinedAt,
      examiner: names.get(chart.examinerId) ?? null,
      finalized: !!chart.finalizedAt,
      summary: summarizePerio(chart.sites),
    }));
  }

  async get(patientId: string, chartId: string) {
    const chart = await this.prisma.db.perioChart.findFirst({
      where: { id: chartId, patientId },
      include: { sites: true, teeth: true },
    });
    if (!chart) throw new NotFoundException('Examen periodontal no encontrado');
    const names = await this.lookup.userNames([chart.examinerId]);
    return {
      id: chart.id,
      patientId,
      examinedAt: chart.examinedAt,
      examiner: names.get(chart.examinerId) ?? null,
      notes: chart.notes,
      finalized: !!chart.finalizedAt,
      finalizedAt: chart.finalizedAt,
      sites: chart.sites
        .sort((a, b) => a.toothCode - b.toothCode || SITE_ORDER.indexOf(a.site) - SITE_ORDER.indexOf(b.site))
        .map((s) => ({
          toothCode: s.toothCode,
          site: s.site,
          probingDepth: s.probingDepth,
          gingivalMargin: s.gingivalMargin,
          bleeding: s.bleeding,
          attachmentLevel: clinicalAttachmentLevel(s.probingDepth, s.gingivalMargin),
        })),
      teeth: chart.teeth
        .sort((a, b) => a.toothCode - b.toothCode)
        .map((t) => ({ toothCode: t.toothCode, furcation: t.furcation, mobility: t.mobility })),
      summary: summarizePerio(chart.sites),
    };
  }

  async create(patientId: string, dto: SavePerioChartDto, user: AuthUser) {
    await this.lookup.assertPatient(patientId);
    this.validate(dto);
    const chart = await this.prisma.db.perioChart.create({
      data: {
        patientId,
        examinerId: user.id,
        notes: dto.notes?.trim() || null,
        sites: { create: dto.sites },
        teeth: { create: dto.teeth },
      },
    });
    return this.get(patientId, chart.id);
  }

  /** Reemplaza las mediciones de un examen todavía abierto (borrador). */
  async update(patientId: string, chartId: string, dto: SavePerioChartDto) {
    const chart = await this.prisma.db.perioChart.findFirst({ where: { id: chartId, patientId } });
    if (!chart) throw new NotFoundException('Examen periodontal no encontrado');
    if (chart.finalizedAt) throw new ConflictException('El examen ya fue finalizado: registre uno nuevo');
    this.validate(dto);
    await this.prisma.db.$transaction([
      this.prisma.db.perioSiteReading.deleteMany({ where: { chartId } }),
      this.prisma.db.perioTooth.deleteMany({ where: { chartId } }),
      this.prisma.db.perioChart.update({
        where: { id: chartId },
        data: {
          notes: dto.notes?.trim() || null,
          sites: { create: dto.sites },
          teeth: { create: dto.teeth },
        },
      }),
    ]);
    return this.get(patientId, chartId);
  }

  async finalize(patientId: string, chartId: string) {
    const chart = await this.prisma.db.perioChart.findFirst({ where: { id: chartId, patientId } });
    if (!chart) throw new NotFoundException('Examen periodontal no encontrado');
    if (chart.finalizedAt) throw new ConflictException('El examen ya fue finalizado');
    const readings = await this.prisma.db.perioSiteReading.count({ where: { chartId } });
    if (readings === 0) throw new BadRequestException('Registre al menos una medición antes de finalizar');
    await this.prisma.db.perioChart.update({ where: { id: chartId }, data: { finalizedAt: new Date() } });
    return this.get(patientId, chartId);
  }

  /** Evolución entre dos exámenes: cambio punto por punto e indicadores resumen. */
  async compare(patientId: string, beforeId: string, afterId: string) {
    const [before, after] = await Promise.all([
      this.get(patientId, beforeId),
      this.get(patientId, afterId),
    ]);
    const asReadings = (sites: typeof before.sites): SiteReading[] => sites;
    const changes = compareSites(asReadings(before.sites), asReadings(after.sites));
    return {
      before: { id: before.id, examinedAt: before.examinedAt, summary: before.summary },
      after: { id: after.id, examinedAt: after.examinedAt, summary: after.summary },
      improved: changes.filter((c) => c.probingDepthChange < 0).length,
      worsened: changes.filter((c) => c.probingDepthChange > 0).length,
      unchanged: changes.filter((c) => c.probingDepthChange === 0).length,
      changes: changes.filter((c) => c.probingDepthChange !== 0 || c.attachmentLevelChange !== 0),
    };
  }

  private validate(dto: SavePerioChartDto): void {
    const seen = new Set<string>();
    for (const site of dto.sites) {
      if (!isValidToothCode(site.toothCode)) {
        throw new BadRequestException(`El diente ${site.toothCode} no existe (use un código FDI)`);
      }
      const key = `${site.toothCode}:${site.site}`;
      if (seen.has(key)) {
        throw new BadRequestException(`Punto repetido: diente ${site.toothCode}, ${site.site}`);
      }
      seen.add(key);
    }
    const teeth = new Set<number>();
    for (const tooth of dto.teeth) {
      if (!isValidToothCode(tooth.toothCode)) {
        throw new BadRequestException(`El diente ${tooth.toothCode} no existe (use un código FDI)`);
      }
      if (teeth.has(tooth.toothCode)) {
        throw new BadRequestException(`Diente repetido: ${tooth.toothCode}`);
      }
      teeth.add(tooth.toothCode);
    }
  }
}
