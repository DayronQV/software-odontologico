import { BadRequestException } from '@nestjs/common';
import { parseEnv } from '../config/app-config';
import { FilesService } from './files.service';

const config = {
  env: parseEnv({
    DATABASE_URL: 'x',
    REDIS_URL: 'x',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  }),
};

describe('FilesService', () => {
  const service = new FilesService(config as never);

  it('limpia nombres de archivo peligrosos', () => {
    expect(FilesService.sanitizeFilename('../../etc/pass wd?.png')).toBe('_.._etc_pass_wd_.png');
    expect(FilesService.sanitizeFilename('...')).toBe('archivo');
    expect(FilesService.sanitizeFilename('radiografía.pdf')).toBe('radiograf_a.pdf');
  });

  it('genera una URL de subida firmada con clave bajo uploads/', async () => {
    const result = await service.createUploadUrl('rx.png', 'image/png');
    expect(result.key).toMatch(/^uploads\/[0-9a-f-]{36}\/rx\.png$/);
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.expiresIn).toBe(300);
  });

  it('rechaza claves fuera de uploads/ o con ..', async () => {
    await expect(service.createDownloadUrl('secreto/otro.txt')).rejects.toThrow(BadRequestException);
    await expect(service.createDownloadUrl('uploads/../x')).rejects.toThrow(BadRequestException);
  });

  it('firma la descarga de una clave válida', async () => {
    const result = await service.createDownloadUrl('uploads/abc/x.pdf');
    expect(result.url).toContain('X-Amz-Signature=');
  });
});
