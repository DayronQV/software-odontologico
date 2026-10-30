import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from '../catalog/settings/settings.service';
import { CommissionsService } from '../commissions/commissions.service';
import { localDayRange } from '../common/local-time';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AGENDA_REPORTS } from './agenda-reports';
import type { ReportQueryDto } from './dto/report-query.dto';
import { toCsv, toPdf } from './export';
import { FINANCE_REPORTS } from './finance-reports';
import { INVENTORY_REPORTS } from './inventory-reports';
import type { ReportDefinition, ReportFilters, ReportResult } from './report.types';

export const REPORTS: ReportDefinition[] = [...FINANCE_REPORTS, ...AGENDA_REPORTS, ...INVENTORY_REPORTS];
const MAX_DAYS = 400;

/** Catálogo de reportes BI (filtros de fecha, consultorio y profesional) y su exportación. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly commissions: CommissionsService,
  ) {}

  /** Reportes que el usuario puede ver: el odontólogo solo los suyos (con sus propios datos). */
  available(user: AuthUser) {
    return REPORTS.filter((r) => user.role !== Role.ODONTOLOGO || r.dentist).map(({ key, title, description }) => ({ key, title, description }));
  }

  /** Normaliza el período (hora de la clínica) y fuerza el alcance del odontólogo a su propio perfil. */
  async filters(query: ReportQueryDto, user: AuthUser): Promise<ReportFilters> {
    const clinic = await this.settings.get();
    const today = new Date();
    const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: clinic.timezone }).format(today);
    const toLabel = query.to ?? localToday;
    const fromLabel = query.from ?? new Intl.DateTimeFormat('en-CA', { timeZone: clinic.timezone }).format(new Date(today.getTime() - 30 * 86_400_000));
    const from = localDayRange(fromLabel, clinic.timezone).start;
    const to = localDayRange(toLabel, clinic.timezone).end;
    if (to <= from) throw new BadRequestException('El período termina antes de empezar');
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_DAYS) throw new BadRequestException(`El período no puede superar ${MAX_DAYS} días`);
    return {
      from,
      to,
      fromLabel,
      toLabel,
      timezone: clinic.timezone,
      currency: clinic.currency,
      opensAtMinute: clinic.opensAtMinute,
      closesAtMinute: clinic.closesAtMinute,
      officeId: query.officeId,
      professionalId: await this.commissions.scopeProfessional(user, query.professionalId),
      groupBy: query.groupBy,
    };
  }

  async run(key: string, query: ReportQueryDto, user: AuthUser): Promise<ReportResult> {
    const definition = REPORTS.find((r) => r.key === key);
    if (!definition) throw new NotFoundException('Reporte no encontrado');
    if (user.role === Role.ODONTOLOGO && !definition.dentist) throw new ForbiddenException('Este reporte no está disponible para su perfil');
    return definition.run(this.prisma.db, await this.filters(query, user));
  }

  /** Exporta un reporte (CSV o PDF). El controlador deja constancia en la auditoría (RNF-06). */
  async export(key: string, format: 'csv' | 'pdf', query: ReportQueryDto, user: AuthUser) {
    const report = await this.run(key, query, user);
    const clinic = await this.settings.get();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${key}-${stamp}.${format}`;
    if (format === 'csv') return { buffer: Buffer.from(toCsv(report), 'utf8'), filename, contentType: 'text/csv; charset=utf-8' };
    return { buffer: await toPdf(report, clinic.clinicName, clinic.timezone, clinic.currency), filename, contentType: 'application/pdf' };
  }
}
