import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeAuditHash, GENESIS_HASH } from './audit-hash';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  role?: Role | null;
  ip?: string | null;
  userAgent?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  firstInvalidId?: string;
  reason?: string;
}

// Clave del bloqueo asesor que serializa la escritura de la cadena de hashes.
const CHAIN_LOCK_KEY = 727001;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega un registro a la cadena. Se serializa con un bloqueo de PostgreSQL para que
   * dos escrituras simultáneas no encadenen al mismo registro previo.
   */
  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
      const last = await tx.auditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { hash: true },
      });
      const prevHash = last?.hash ?? GENESIS_HASH;
      const timestamp = new Date();
      const hash = computeAuditHash(prevHash, {
        timestamp: timestamp.toISOString(),
        userId: entry.userId ?? null,
        role: entry.role ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      });
      await tx.auditLog.create({
        data: {
          timestamp,
          userId: entry.userId ?? null,
          role: entry.role ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          before: entry.before,
          after: entry.after,
          prevHash,
          hash,
        },
      });
    });
  }

  async query(filters: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.entity && { entity: filters.entity }),
      ...((filters.from || filters.to) && {
        timestamp: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
    };
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const [total, rows] = await Promise.all([
      this.prisma.db.auditLog.count({ where }),
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        ...r,
        id: r.id.toString(),
        timestamp: r.timestamp.toISOString(),
      })),
    };
  }

  /** Recorre toda la cadena recalculando los hashes; detecta alteraciones y borrados. */
  async verifyChain(): Promise<ChainVerification> {
    let prev = GENESIS_HASH;
    let checked = 0;
    let cursor: bigint | undefined;

    for (;;) {
      const rows = await this.prisma.db.auditLog.findMany({
        where: cursor === undefined ? undefined : { id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: 1000,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        if (row.prevHash !== prev) {
          return {
            valid: false,
            checked,
            firstInvalidId: row.id.toString(),
            reason: 'prevHash no coincide: hay un registro eliminado o reordenado',
          };
        }
        const expected = computeAuditHash(prev, {
          timestamp: row.timestamp.toISOString(),
          userId: row.userId,
          role: row.role,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          ip: row.ip,
          userAgent: row.userAgent,
          before: row.before,
          after: row.after,
        });
        if (expected !== row.hash) {
          return {
            valid: false,
            checked,
            firstInvalidId: row.id.toString(),
            reason: 'hash no coincide: el registro fue alterado',
          };
        }
        prev = row.hash;
        checked++;
        cursor = row.id;
      }
    }
    return { valid: true, checked };
  }
}
