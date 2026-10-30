const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
export const MAX_SIGNATURE_BYTES = 400 * 1024;

/**
 * Convierte la firma trazada en pantalla (PNG en data URL) en bytes, verificando que realmente sea
 * un PNG y que no sea desproporcionado. Devuelve `null` si no es válida.
 */
export function decodeSignatureImage(dataUrl: string): Buffer | null {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 100 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  return bytes.subarray(0, 8).equals(PNG_SIGNATURE) ? bytes : null;
}
