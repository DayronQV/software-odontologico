import type { PrismaService } from './prisma.service';

/** Cliente transaccional del cliente extendido (`prisma.db.$transaction(async (tx) => …)`). */
export type Tx = Parameters<Parameters<PrismaService['db']['$transaction']>[0]>[0];
