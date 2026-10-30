import { AppConfigService } from '../config/app-config';
import { CryptoService } from './crypto.service';

const config = (key: string) => ({ env: { ENCRYPTION_KEY: key } }) as AppConfigService;
const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

describe('CryptoService (AES-256-GCM)', () => {
  const service = new CryptoService(config(KEY_A));

  it('cifra y descifra de ida y vuelta (incluye acentos y emojis)', () => {
    const plain = 'Paciente Peña — alergia a penicilina 🦷';
    const encrypted = service.encrypt(plain);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain('penicilina');
    expect(service.decrypt(encrypted)).toBe(plain);
  });

  it('usa un IV aleatorio: el mismo texto produce cifrados distintos', () => {
    expect(service.encrypt('igual')).not.toBe(service.encrypt('igual'));
  });

  it('detecta alteración del contenido (autenticación GCM)', () => {
    const encrypted = service.encrypt('dato');
    const raw = Buffer.from(encrypted.slice(7), 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = 'enc:v1:' + raw.toString('base64');
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('no descifra con otra clave', () => {
    const other = new CryptoService(config(KEY_B));
    expect(() => other.decrypt(service.encrypt('secreto'))).toThrow();
  });

  it('rechaza valores sin el formato esperado o truncados', () => {
    expect(() => service.decrypt('texto plano')).toThrow('formato');
    expect(() => service.decrypt('enc:v1:AAAA')).toThrow('truncado');
  });

  it('blindIndex: misma huella para el mismo documento, sin importar el formato', () => {
    expect(service.blindIndex('010-203.0405')).toBe(service.blindIndex(' 0102030405 '));
    expect(service.blindIndex('ab 123')).toBe(service.blindIndex('AB123'));
    expect(service.blindIndex('0102030405')).not.toBe(service.blindIndex('0102030406'));
    expect(service.blindIndex('0102030405')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blindIndex depende de la clave: otra clave, otra huella', () => {
    expect(new CryptoService(config(KEY_B)).blindIndex('123')).not.toBe(service.blindIndex('123'));
  });

  it('isEncrypted distingue valores cifrados', () => {
    expect(service.isEncrypted(service.encrypt('x'))).toBe(true);
    expect(service.isEncrypted('x')).toBe(false);
  });
});
