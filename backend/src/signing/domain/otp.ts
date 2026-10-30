import { randomInt, timingSafeEqual } from 'node:crypto';

/** Código de un solo uso para firmar (RF-06): 6 dígitos, vigente 10 minutos, 3 intentos. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 3;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export const otpExpiry = (from: Date): Date => new Date(from.getTime() + OTP_TTL_MINUTES * 60_000);

/** Comparación en tiempo constante entre dos huellas hexadecimales. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Oculta casi todo el contacto: "+593 99 123 4567" → "••••4567"; "ana@mail.com" → "a••@mail.com". */
export function maskContact(contact: string): string {
  if (contact.includes('@')) {
    const [user, domain] = contact.split('@');
    return `${user.slice(0, 1)}••@${domain}`;
  }
  return `••••${contact.replace(/\D/g, '').slice(-4)}`;
}
