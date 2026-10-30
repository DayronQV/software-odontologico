export type AttachmentKind = 'XRAY' | 'PHOTO' | 'DOCUMENT';

export interface AttachmentItem {
  id: string;
  kind: AttachmentKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  description: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export const KIND_LABELS: Record<AttachmentKind, string> = {
  XRAY: 'Radiografía',
  PHOTO: 'Foto clínica',
  DOCUMENT: 'Documento',
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.webp,.pdf';

export const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
