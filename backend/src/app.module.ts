import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { PatientsModule } from './patients/patients.module';
import { AgendaModule } from './agenda/agenda.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { ReportsModule } from './reports/reports.module';
import { CommissionsModule } from './commissions/commissions.module';
import { InventoryModule } from './inventory/inventory.module';
import { ClinicalModule } from './clinical/clinical.module';
import { SigningModule } from './signing/signing.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { DEFAULT_THROTTLE } from './common/throttle';
import { ConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { SystemModule } from './system/system.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    CryptoModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRoot([{ ttl: DEFAULT_THROTTLE.ttl, limit: DEFAULT_THROTTLE.limit }]),
    AuditModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    PatientsModule,
    AgendaModule,
    NotificationsModule,
    BillingModule,
    SigningModule,
    CommissionsModule,
    ReportsModule,
    InventoryModule,
    ClinicalModule,
    TreatmentsModule,
    FilesModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    SystemModule,
  ],
  providers: [
    // El orden importa: 1) límite de peticiones, 2) autenticación + MFA, 3) roles (deniega por defecto).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
