import { parseRedisUrl } from './redis-connection';

describe('parseRedisUrl', () => {
  it('lee host, puerto, contraseña y base de datos', () => {
    expect(parseRedisUrl('redis://:s3%2Fcr@cache:6380/2')).toEqual({
      host: 'cache',
      port: 6380,
      username: undefined,
      password: 's3/cr',
      db: 2,
    });
  });

  it('usa valores por defecto', () => {
    expect(parseRedisUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
    });
  });
});
