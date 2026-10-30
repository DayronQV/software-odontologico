import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CashReportsService } from './cash/cash-reports.service';
import { CashSessionsService } from './cash/cash-sessions.service';
import { CashController } from './cash/cash.controller';
import { InvoiceIssuingService } from './invoices/invoice-issuing.service';
import { InvoicePdfService } from './invoices/invoice-pdf.service';
import { InvoiceVoidService } from './invoices/invoice-void.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesQueryService } from './invoices/invoices-query.service';

/** Facturación electrónica (simulada), pagos mixtos y caja con cierre ciego (RF-12, RN-02). */
@Module({
  imports: [CatalogModule, CommissionsModule, IntegrationsModule],
  controllers: [InvoicesController, CashController],
  providers: [
    CashSessionsService,
    CashReportsService,
    InvoicesQueryService,
    InvoiceIssuingService,
    InvoiceVoidService,
    InvoicePdfService,
  ],
})
export class BillingModule {}
