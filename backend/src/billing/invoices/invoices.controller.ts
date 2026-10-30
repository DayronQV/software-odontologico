import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CASHIERS } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { IssueInvoiceDto, VoidInvoiceDto } from './dto/issue-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceVoidService } from './invoice-void.service';
import { InvoicesQueryService } from './invoices-query.service';

/** Punto de venta y comprobantes electrónicos (RF-12). Toda operación financiera se audita y exige MFA. */
@ApiTags('billing')
@ApiBearerAuth()
@AuditEntity('Invoice')
@Controller('billing/invoices')
export class InvoicesController {
  constructor(
    private readonly issuing: InvoiceIssuingService,
    private readonly voiding: InvoiceVoidService,
    private readonly query: InvoicesQueryService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Roles(...CASHIERS)
  @Post()
  issue(@Body() dto: IssueInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.issuing.issue(dto, user);
  }

  @Roles(...CASHIERS, Role.AUDITOR)
  @Get()
  list(@Query() query: InvoiceQueryDto) {
    return this.query.list(query);
  }

  @Roles(...CASHIERS, Role.AUDITOR)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.query.findOne(id);
  }

  /** PDF del comprobante (cada descarga se registra como exportación). */
  @Roles(...CASHIERS, Role.AUDITOR)
  @AuditAction('EXPORT')
  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.pdf.render(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
    });
  }

  /** Anula con nota de crédito (solo administrador). */
  @Roles(Role.ADMIN_TI)
  @AuditAction('VOID')
  @HttpCode(200)
  @Post(':id/void')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.voiding.void(id, dto.reason, user);
  }

  /** Reintenta la autorización fiscal de un comprobante pendiente. */
  @Roles(...CASHIERS)
  @AuditAction('FISCAL_RETRY')
  @HttpCode(200)
  @Post(':id/fiscal-retry')
  fiscalRetry(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuing.retryFiscal(id);
  }
}
