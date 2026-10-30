import { DEV_ENCRYPTION_KEY, DEV_JWT_SECRET, parseEnv } from './app-config';

const valid = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
};

describe('parseEnv', () => {
  it('aplica valores por defecto seguros', () => {
    const env = parseEnv(valid);
    expect(env.SESSION_IDLE_SECONDS).toBe(900);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('exige claves obligatorias', () => {
    expect(() => parseEnv({})).toThrow('Configuración de entorno inválida');
  });

  it('la clave de cifrado debe ser de 32 bytes (AES-256)', () => {
    expect(() => parseEnv({ ...valid, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(
      'ENCRYPTION_KEY',
    );
  });

  it('la inactividad nunca puede superar 15 minutos (RNF-05)', () => {
    expect(() => parseEnv({ ...valid, SESSION_IDLE_SECONDS: '901' })).toThrow();
    expect(parseEnv({ ...valid, SESSION_IDLE_SECONDS: '900' }).SESSION_IDLE_SECONDS).toBe(900);
  });

  it('en producción rechaza los secretos de desarrollo', () => {
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: 'production', JWT_ACCESS_SECRET: DEV_JWT_SECRET }),
    ).toThrow('desarrollo');
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: 'production', ENCRYPTION_KEY: DEV_ENCRYPTION_KEY }),
    ).toThrow('desarrollo');
    expect(parseEnv({ ...valid, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });
});
