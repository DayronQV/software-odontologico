import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AlertsService } from '../inventory/alerts.service';
import type { ReportQueryDto } from './dto/report-query.dto';
import { money } from './report.types';
import { ReportsService, REPORTS } from './reports.service';

const TTL_SECONDS = 60;

/**
 * Panel con KPIs y series. Se arma con las mismas consultas agregadas de los reportes y se guarda
 * 60 s en Redis (por filtros) para que abrir el panel no cargue la base de datos.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly reports: ReportsService,
    private readonly alerts: AlertsService,
  ) {}

  async get(query: ReportQueryDto, user: AuthUser) {
    const filters = await this.reports.filters(query, user);
    const key = `reports:dashboard:${filters.fromLabel}:${filters.toLabel}:${filters.officeId ?? ''}:${filters.professionalId ?? ''}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return { ...(JSON.parse(cached) as object), cached: true };

    const run = (reportKey: string, groupBy?: string) => REPORTS.find((r) => r.key === reportKey)!.run(this.prisma.db, { ...filters, groupBy });
    const [byDay, byProfessional, agenda, budgets, inventoryAlerts, pending, methods] = await Promise.all([
      run('revenue', 'day'),
      run('revenue', 'professional'),
      run('agenda'),
      run('budgets'),
      this.alerts.list(),
      this.prisma.db.commissionEntry.aggregate({ where: { settlementId: null, ...(filters.professionalId && { professionalId: filters.professionalId }) }, _sum: { amount: true } }),
      this.prisma.db.payment.groupBy({ by: ['method'], where: { createdAt: { gte: filters.from, lt: filters.to }, invoice: { status: 'ISSUED' } }, _sum: { amount: true } }),
    ]);

    const result = {
      period: { from: filters.fromLabel, to: filters.toLabel },
      kpis: {
        revenue: money(byDay.totals?.total),
        invoices: Number(byDay.totals?.invoices ?? 0),
        appointments: Number(agenda.totals?.total ?? 0),
        noShowRate: Number(agenda.totals?.noShowRate ?? 0),
        occupancy: Number(agenda.totals?.occupancy ?? 0),
        budgetConversion: Number(budgets.totals?.conversionRate ?? 0),
        lowStock: inventoryAlerts.low.length,
        expiring: inventoryAlerts.expiring.length,
        pendingCommissions: money(pending._sum.amount),
      },
      revenueByDay: byDay.rows.map((r) => ({ label: String(r.label), value: Number(r.total) })),
      revenueByProfessional: byProfessional.rows.slice(0, 8).map((r) => ({ label: String(r.label), value: Number(r.total) })),
      paymentMethods: methods.map((m) => ({ method: m.method, amount: money(m._sum.amount) })),
      currency: filters.currency,
      cached: false,
    };
    await this.redis.client.set(key, JSON.stringify(result), 'EX', TTL_SECONDS).catch(() => undefined);
    return result;
  }
}
