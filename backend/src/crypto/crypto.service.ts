import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/app-config';

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Cifrado en reposo a nivel de aplicación (RNF-04): AES-256-GCM con IV aleatorio por valor.
 * Formato: `enc:v1:` + base64(iv | authTag | ciphertext).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = Buffer.from(config.env.ENCRYPTION_KEY, 'base64');
  }

  /**
   * Índice ciego: huella HMAC-SHA256 del texto normalizado (sin espacios, puntos ni guiones, en
   * mayúsculas). Permite buscar por coincidencia exacta un dato que está cifrado (p. ej. el
   * documento de identidad) sin guardarlo en claro ni poder revertir la huella.
   */
  blindIndex(value: string): string {
    const normalized = value.trim().toUpperCase().replace(/[\s.-]/g, '');
    return createHmac('sha256', Buffer.concat([this.key, Buffer.from('blind-index')]))
      .update(normalized)
      .digest('hex');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decrypt(value: string): string {
    if (!this.isEncrypted(value)) {
      throw new Error('El valor no está cifrado con el formato esperado');
    }
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    if (raw.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Valor cifrado truncado');
    }
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
