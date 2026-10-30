import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES, generateOtp, maskContact, otpExpiry, safeEqualHex } from './otp';
import { MAX_SIGNATURE_BYTES, decodeSignatureImage } from './signature-image';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUrl = (bytes: Buffer, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`;

describe('código de un solo uso (RF-06)', () => {
  it('son 6 dígitos y varía entre llamadas', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtp()));
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(40);
  });

  it('caduca a los 10 minutos y admite 3 intentos', () => {
    const from = new Date('2026-11-02T10:00:00.000Z');
    expect(otpExpiry(from).toISOString()).toBe('2026-11-02T10:10:00.000Z');
    expect(OTP_TTL_MINUTES).toBe(10);
    expect(OTP_MAX_ATTEMPTS).toBe(3);
  });

  it('compara huellas en tiempo constante', () => {
    expect(safeEqualHex('abcd', 'abcd')).toBe(true);
    expect(safeEqualHex('abcd', 'abce')).toBe(false);
    expect(safeEqualHex('abcd', 'abcdef')).toBe(false);
  });

  it('oculta el teléfono y el correo al mostrar dónde se envió', () => {
    expect(maskContact('+593 99 123 4567')).toBe('••••4567');
    expect(maskContact('carlos.mendoza@correo.test')).toBe('c••@correo.test');
  });
});

describe('imagen de la firma táctil', () => {
  const valid = Buffer.concat([PNG_HEAD, Buffer.alloc(200, 7)]);

  it('acepta un PNG en data URL', () => {
    expect(decodeSignatureImage(dataUrl(valid))?.equals(valid)).toBe(true);
  });

  it('rechaza otros formatos, texto y contenido que no es PNG', () => {
    expect(decodeSignatureImage(dataUrl(valid, 'image/jpeg'))).toBeNull();
    expect(decodeSignatureImage('hola')).toBeNull();
    expect(decodeSignatureImage(dataUrl(Buffer.alloc(300, 1)))).toBeNull();
    expect(decodeSignatureImage(dataUrl(Buffer.concat([PNG_HEAD, Buffer.alloc(10)])))).toBeNull(); // demasiado pequeña
  });

  it('rechaza firmas desproporcionadas', () => {
    const huge = Buffer.concat([PNG_HEAD, Buffer.alloc(MAX_SIGNATURE_BYTES)]);
    expect(decodeSignatureImage(dataUrl(huge))).toBeNull();
  });
});
