/** Catálogo visual estandarizado del odontograma (RF-03). Cada hallazgo se distingue por color Y por forma. */
export type FindingType =
  | 'CARIES'
  | 'RESTORATION'
  | 'ENDODONTICS_DONE'
  | 'ENDODONTICS_REQUIRED'
  | 'IMPLANT'
  | 'PROSTHESIS_FIXED'
  | 'PROSTHESIS_REMOVABLE'
  | 'EXTRACTION'
  | 'SEALANT';

export type FindingStatus = 'EXISTING' | 'PLANNED' | 'DONE';
export type ToothSurface = 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'VESTIBULAR' | 'LINGUAL' | 'WHOLE';

export interface Finding {
  id: string;
  toothCode: number;
  surface: ToothSurface;
  type: FindingType;
  status: FindingStatus;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  replacesId: string | null;
}

export interface OdontogramData {
  patientId: string;
  dentition: 'PERMANENT' | 'PRIMARY' | 'MIXED';
  asOf: string | null;
  findings: Finding[];
}

export interface FindingVisual {
  label: string;
  /** Color de relleno (caries rojo, restauraciones azul…). */
  color: string;
  /** Hallazgo que afecta al diente completo en lugar de una superficie. */
  whole: boolean;
  /** Forma auxiliar: no se depende solo del color. */
  pattern: 'dots' | 'hatch' | 'grid' | 'solid';
}

export const FINDING_TYPES: Record<FindingType, FindingVisual> = {
  CARIES: { label: 'Caries', color: '#d94f4f', whole: false, pattern: 'dots' },
  RESTORATION: { label: 'Restauración existente', color: '#3b82c4', whole: false, pattern: 'hatch' },
  SEALANT: { label: 'Sellante', color: '#4a9d6f', whole: false, pattern: 'grid' },
  ENDODONTICS_DONE: { label: 'Endodoncia realizada', color: '#2a716e', whole: true, pattern: 'solid' },
  ENDODONTICS_REQUIRED: { label: 'Endodoncia requerida', color: '#d9962b', whole: true, pattern: 'solid' },
  IMPLANT: { label: 'Implante', color: '#7c6bb8', whole: true, pattern: 'solid' },
  PROSTHESIS_FIXED: { label: 'Prótesis fija', color: '#475569', whole: true, pattern: 'solid' },
  PROSTHESIS_REMOVABLE: { label: 'Prótesis removible', color: '#64748b', whole: true, pattern: 'solid' },
  EXTRACTION: { label: 'Exodoncia', color: '#1f2937', whole: true, pattern: 'solid' },
};

export const FINDING_ORDER = Object.keys(FINDING_TYPES) as FindingType[];

export const STATUS_LABELS: Record<FindingStatus, string> = {
  EXISTING: 'Existente',
  PLANNED: 'Planificado',
  DONE: 'Realizado',
};

export const SURFACE_LABELS: Record<ToothSurface, string> = {
  MESIAL: 'Mesial',
  DISTAL: 'Distal',
  OCCLUSAL: 'Oclusal',
  VESTIBULAR: 'Vestibular',
  LINGUAL: 'Lingual / palatino',
  WHOLE: 'Diente completo',
};

/** Prioridad al dibujar varios hallazgos sobre una misma superficie. */
export const findingPriority = (type: FindingType): number => FINDING_ORDER.indexOf(type);
