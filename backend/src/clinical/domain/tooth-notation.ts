import { Dentition } from './dentition';

/**
 * Notaciones dentales (RF-03). Internamente todo se guarda con el código FDI (ISO 3950);
 * la notación Universal es solo una forma de mostrarlo:
 *  - permanentes: FDI 11–48  ↔  Universal 1–32
 *  - temporales:  FDI 51–85  ↔  Universal A–T
 */

const quadrantTeeth = (quadrant: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => quadrant * 10 + i + 1);

/** FDI → Universal para los 32 permanentes. */
const PERMANENT_TO_UNIVERSAL = new Map<number, string>();
/** FDI → Universal para los 20 temporales (A–T). */
const PRIMARY_TO_UNIVERSAL = new Map<number, string>();

// Cuadrante 1 (superior derecho): FDI 18…11 → 1…8
for (let i = 8; i >= 1; i--) PERMANENT_TO_UNIVERSAL.set(10 + i, String(9 - i));
// Cuadrante 2 (superior izquierdo): FDI 21…28 → 9…16
for (let i = 1; i <= 8; i++) PERMANENT_TO_UNIVERSAL.set(20 + i, String(8 + i));
// Cuadrante 3 (inferior izquierdo): FDI 38…31 → 17…24
for (let i = 8; i >= 1; i--) PERMANENT_TO_UNIVERSAL.set(30 + i, String(25 - i));
// Cuadrante 4 (inferior derecho): FDI 41…48 → 25…32
for (let i = 1; i <= 8; i++) PERMANENT_TO_UNIVERSAL.set(40 + i, String(24 + i));

const LETTERS = 'ABCDEFGHIJKLMNOPQRST';
// Temporales: 55…51 → A–E, 61…65 → F–J, 75…71 → K–O, 81…85 → P–T
[55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 75, 74, 73, 72, 71, 81, 82, 83, 84, 85].forEach(
  (code, index) => PRIMARY_TO_UNIVERSAL.set(code, LETTERS[index]),
);

const UNIVERSAL_TO_FDI = new Map<string, number>();
for (const [fdi, universal] of [...PERMANENT_TO_UNIVERSAL, ...PRIMARY_TO_UNIVERSAL]) {
  UNIVERSAL_TO_FDI.set(universal, fdi);
}

export const PERMANENT_TEETH_COUNT = 32;
export const PRIMARY_TEETH_COUNT = 20;

export function isPermanentTooth(code: number): boolean {
  return PERMANENT_TO_UNIVERSAL.has(code);
}

export function isPrimaryTooth(code: number): boolean {
  return PRIMARY_TO_UNIVERSAL.has(code);
}

export function isValidToothCode(code: number): boolean {
  return isPermanentTooth(code) || isPrimaryTooth(code);
}

export function fdiToUniversal(code: number): string {
  const universal = PERMANENT_TO_UNIVERSAL.get(code) ?? PRIMARY_TO_UNIVERSAL.get(code);
  if (!universal) throw new RangeError(`Código FDI inválido: ${code}`);
  return universal;
}

export function universalToFdi(label: string): number {
  const fdi = UNIVERSAL_TO_FDI.get(label.trim().toUpperCase());
  if (fdi === undefined) throw new RangeError(`Código Universal inválido: ${label}`);
  return fdi;
}

/** Posición del diente dentro de su cuadrante (1 = incisivo central … 8 = tercer molar). */
const positionInQuadrant = (code: number): number => code % 10;

export type ToothKind = 'INCISOR' | 'CANINE' | 'PREMOLAR' | 'MOLAR';

export function toothKind(code: number): ToothKind {
  if (!isValidToothCode(code)) throw new RangeError(`Código FDI inválido: ${code}`);
  const position = positionInQuadrant(code);
  if (isPrimaryTooth(code)) {
    if (position <= 2) return 'INCISOR';
    if (position === 3) return 'CANINE';
    return 'MOLAR'; // los temporales no tienen premolares
  }
  if (position <= 2) return 'INCISOR';
  if (position === 3) return 'CANINE';
  if (position <= 5) return 'PREMOLAR';
  return 'MOLAR';
}

/** En incisivos y caninos la superficie de masticación se llama "incisal"; en el resto, "oclusal". */
export function usesIncisalEdge(code: number): boolean {
  const kind = toothKind(code);
  return kind === 'INCISOR' || kind === 'CANINE';
}

/** Dientes de un arco en el orden en que se dibujan (de derecha a izquierda del paciente). */
export function archTeeth(arch: 'UPPER' | 'LOWER', dentition: 'PERMANENT' | 'PRIMARY'): number[] {
  const upper = dentition === 'PERMANENT' ? [1, 2] : [5, 6];
  const lower = dentition === 'PERMANENT' ? [4, 3] : [8, 7];
  const [right, left] = arch === 'UPPER' ? upper : lower;
  const count = dentition === 'PERMANENT' ? 8 : 5;
  const rightSide = quadrantTeeth(right, count).reverse();
  const leftSide = quadrantTeeth(left, count);
  return [...rightSide, ...leftSide];
}

/** Todos los dientes que aplican según la dentición del paciente (mixta = ambas). */
export function teethFor(dentition: Dentition): number[] {
  const permanent = [...archTeeth('UPPER', 'PERMANENT'), ...archTeeth('LOWER', 'PERMANENT')];
  const primary = [...archTeeth('UPPER', 'PRIMARY'), ...archTeeth('LOWER', 'PRIMARY')];
  if (dentition === 'PERMANENT') return permanent;
  if (dentition === 'PRIMARY') return primary;
  return [...permanent, ...primary];
}
