import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';
import { encryptionExtension } from './encryption.extension';

/**
 * Acceso a PostgreSQL. Usa siempre `prisma.db`: es el cliente con cifrado transparente
 * de los campos sensibles (ver encryption.extension.ts).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly base = new PrismaClient();
  readonly db: ReturnType<PrismaService['createExtended']>;

  constructor(private readonly crypto: CryptoService) {
    this.db = this.createExtended();
  }

  private createExtended() {
    return this.base.$extends(encryptionExtension(this.crypto));
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
