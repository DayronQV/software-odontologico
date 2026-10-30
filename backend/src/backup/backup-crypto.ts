import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

/** Formato: MAGIC(8) | IV(12) | texto cifrado AES-256-GCM | etiqueta de autenticación(16). */
const MAGIC = Buffer.from('SIGOBK01');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** La clave de respaldo se deriva (HKDF) de ENCRYPTION_KEY: no se reutiliza la misma clave en ambos usos. */
export function deriveBackupKey(encryptionKeyBase64: string): Buffer {
  const master = Buffer.from(encryptionKeyBase64, 'base64');
  if (master.length !== 32) throw new Error('ENCRYPTION_KEY debe ser una clave de 32 bytes en base64');
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'sigo-dental/backup/v1', 32));
}

/** Cifra un archivo con AES-256-GCM en flujo y devuelve el SHA-256 del archivo cifrado. */
export async function encryptFile(input: string, output: string, key: Buffer): Promise<string> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
  const hash = createHash('sha256');
  const header = Buffer.concat([MAGIC, iv]);
  hash.update(header);
  const out = createWriteStream(output);
  out.write(header);
  cipher.on('data', (chunk: Buffer) => hash.update(chunk));
  await pipeline(createReadStream(input), cipher, out, { end: false });
  const tag = cipher.getAuthTag();
  hash.update(tag);
  await new Promise<void>((resolve, reject) => {
    out.once('error', reject);
    out.end(tag, () => resolve());
  });
  return hash.digest('hex');
}

/** Descifra y VERIFICA la integridad (etiqueta GCM): falla si el archivo fue alterado o la clave no es la correcta. */
export async function decryptFile(input: string, output: string, key: Buffer): Promise<void> {
  const { size } = await stat(input);
  const headerLength = MAGIC.length + IV_LENGTH;
  if (size < headerLength + TAG_LENGTH) throw new Error('El respaldo está incompleto');
  const [header, tag] = await Promise.all([
    readRange(input, 0, headerLength - 1),
    readRange(input, size - TAG_LENGTH, size - 1),
  ]);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('El archivo no es un respaldo de SIGO-Dental');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length), {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(input, { start: headerLength, end: size - TAG_LENGTH - 1 }),
    decipher,
    createWriteStream(output),
  );
}

async function readRange(path: string, start: number, end: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of createReadStream(path, { start, end })) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
