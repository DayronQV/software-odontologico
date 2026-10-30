import { AttachmentKind } from '@prisma/client';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type DetectedType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

const EXTENSIONS: Record<DetectedType, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Tipo real del archivo según sus primeros bytes (no se confía en el nombre ni en el Content-Type). */
export function detectContentType(buffer: Buffer): DetectedType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Cadena de prueba EICAR: los antivirus reales la marcan; aquí se bloquea como control básico. */
export const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
/** PDF con acciones activas (JavaScript, lanzamiento de programas, apertura automática). */
const ACTIVE_PDF_MARKERS = ['/JavaScript', '/JS', '/Launch', '/OpenAction', '/EmbeddedFile', '/RichMedia'];

/** Análisis básico del contenido. Devuelve el motivo del rechazo o `null` si parece seguro. */
export function scanForMalware(buffer: Buffer, type: DetectedType): string | null {
  const text = buffer.toString('latin1');
  if (text.includes(EICAR_TEST_STRING)) return 'El archivo fue bloqueado por el análisis de seguridad';
  if (type === 'application/pdf') {
    const marker = ACTIVE_PDF_MARKERS.find((m) => text.includes(m));
    if (marker) return 'El PDF contiene contenido activo y no se acepta';
  }
  return null;
}

export interface ValidatedUpload {
  contentType: DetectedType;
  kind: AttachmentKind;
}

export type UploadValidation =
  | { ok: true; value: ValidatedUpload }
  | { ok: false; error: string };

/** Valida tamaño, extensión, tipo real y contenido. */
export function validateUpload(
  filename: string,
  buffer: Buffer,
  requestedKind?: AttachmentKind,
): UploadValidation {
  if (buffer.length === 0) return { ok: false, error: 'El archivo está vacío' };
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'El archivo supera el máximo de 15 MB' };
  }
  const detected = detectContentType(buffer);
  if (!detected) return { ok: false, error: 'Tipo de archivo no permitido (use PNG, JPG, WebP o PDF)' };
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS[detected].includes(extension)) {
    return { ok: false, error: 'La extensión no corresponde al contenido del archivo' };
  }
  const threat = scanForMalware(buffer, detected);
  if (threat) return { ok: false, error: threat };

  const isPdf = detected === 'application/pdf';
  if (isPdf && requestedKind && requestedKind !== AttachmentKind.DOCUMENT) {
    return { ok: false, error: 'Un PDF solo puede registrarse como documento' };
  }
  const kind = requestedKind ?? (isPdf ? AttachmentKind.DOCUMENT : AttachmentKind.PHOTO);
  return { ok: true, value: { contentType: detected, kind } };
}
