import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, pageResult } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import type { InvoiceQueryDto } from './dto/invoice-query.dto';
import {
  INVOICE_INCLUDE,
  toInvoiceListItem,
  toInvoiceView,
  type InvoiceView,
} from './invoice-view.mapper';

@Injectable()
export class InvoicesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: InvoiceQueryDto) {
    const args = pageArgs(query, 20);
    const where: Prisma.InvoiceWhereInput = {
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.status && { status: query.status }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
    };
    const [total, invoices] = await Promise.all([
      this.prisma.db.invoice.count({ where }),
      this.prisma.db.invoice.findMany({
        where,
        orderBy: { number: 'desc' },
        skip: args.skip,
        take: args.take,
        include: { patient: { select: { firstName: true, lastName: true } }, payments: true },
      }),
    ]);
    return pageResult(invoices.map(toInvoiceListItem), total, args);
  }

  async findOne(id: string): Promise<InvoiceView> {
    const invoice = await this.prisma.db.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    return toInvoiceView(invoice);
  }
}
