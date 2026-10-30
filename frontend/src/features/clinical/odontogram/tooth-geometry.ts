import type { ToothSurface } from './findings';
import { isOnPatientRight, isUpperTooth } from './tooth-notation';

/** Diagrama de 5 superficies en un cuadro de 48 × 48: cuatro trapecios alrededor de un cuadro central. */
export type Slot = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'CENTER';

export const SLOT_POINTS: Record<Slot, string> = {
  TOP: '2,2 46,2 34,14 14,14',
  BOTTOM: '2,46 46,46 34,34 14,34',
  LEFT: '2,2 14,14 14,34 2,46',
  RIGHT: '46,2 34,14 34,34 46,46',
  CENTER: '14,14 34,14 34,34 14,34',
};

/** Posición de cada letra dentro de su trapecio, para rotular la superficie en el editor grande. */
export const SLOT_LABEL_POSITION: Record<Slot, [number, number]> = {
  TOP: [24, 9.5],
  BOTTOM: [24, 41],
  LEFT: [7.5, 25.5],
  RIGHT: [40.5, 25.5],
  CENTER: [24, 26],
};

export type SurfaceSlot = Exclude<ToothSurface, 'WHOLE'>;

/**
 * Qué superficie ocupa cada lado del diagrama:
 *  - el vestibular queda hacia afuera (arriba en el arco superior, abajo en el inferior);
 *  - el mesial mira hacia la línea media del paciente.
 */
export function surfaceSlots(toothCode: number): Record<SurfaceSlot, Slot> {
  const upper = isUpperTooth(toothCode);
  const mesialRight = isOnPatientRight(toothCode);
  return {
    VESTIBULAR: upper ? 'TOP' : 'BOTTOM',
    LINGUAL: upper ? 'BOTTOM' : 'TOP',
    MESIAL: mesialRight ? 'RIGHT' : 'LEFT',
    DISTAL: mesialRight ? 'LEFT' : 'RIGHT',
    OCCLUSAL: 'CENTER',
  };
}

export const SURFACE_LETTER: Record<SurfaceSlot, string> = {
  VESTIBULAR: 'V',
  LINGUAL: 'L',
  MESIAL: 'M',
  DISTAL: 'D',
  OCCLUSAL: 'O',
};
