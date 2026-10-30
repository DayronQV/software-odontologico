import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config';
import { CryptoService } from '../crypto/crypto.service';
import { encryptionExtension } from '../prisma/encryption.extension';

/** Cliente con cifrado transparente (igual que la aplicación) y utilidades de cifrado. */
export function createSeedContext() {
  const crypto = new CryptoService(new AppConfigService());
  const prisma = new PrismaClient().$extends(encryptionExtension(crypto));
  return { prisma, crypto };
}

export type SeedContext = ReturnType<typeof createSeedContext>;
