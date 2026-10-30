/**
 * Notaciones dentales (RF-03). Todo se guarda con el código FDI; la notación Universal es solo una
 * forma de mostrarlo: permanentes FDI 11–48 ↔ 1–32 · temporales FDI 51–85 ↔ A–T.
 */
export type Dentition = 'PERMANENT' | 'PRIMARY' | 'MIXED';
export type Notation = 'FDI' | 'UNIVERSAL';

const PERMANENT_TO_UNIVERSAL = new Map<number, string>();
const PRIMARY_TO_UNIVERSAL = new Map<number, string>();

for (let i = 8; i >= 1; i--) PERMANENT_TO_UNIVERSAL.set(10 + i, String(9 - i)); // 18…11 → 1…8
for (let i = 1; i <= 8; i++) PERMANENT_TO_UNIVERSAL.set(20 + i, String(8 + i)); // 21…28 → 9…16
for (let i = 8; i >= 1; i--) PERMANENT_TO_UNIVERSAL.set(30 + i, String(25 - i)); // 38…31 → 17…24
for (let i = 1; i <= 8; i++) PERMANENT_TO_UNIVERSAL.set(40 + i, String(24 + i)); // 41…48 → 25…32

const LETTERS = 'ABCDEFGHIJKLMNOPQRST';
[55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 75, 74, 73, 72, 71, 81, 82, 83, 84, 85].forEach((code, index) =>
  PRIMARY_TO_UNIVERSAL.set(code, LETTERS[index]),
);

export const isPermanentTooth = (code: number) => PERMANENT_TO_UNIVERSAL.has(code);
export const isPrimaryTooth = (code: number) => PRIMARY_TO_UNIVERSAL.has(code);
export const isValidToothCode = (code: number) => isPermanentTooth(code) || isPrimaryTooth(code);

export function fdiToUniversal(code: number): string {
  const universal = PERMANENT_TO_UNIVERSAL.get(code) ?? PRIMARY_TO_UNIVERSAL.get(code);
  if (!universal) throw new RangeError(`Código FDI inválido: ${code}`);
  return universal;
}

/** Notación Universal ("30", "A") → código FDI. */
export function universalToFdi(label: string): number {
  const wanted = label.trim().toUpperCase();
  for (const [fdi, universal] of [...PERMANENT_TO_UNIVERSAL, ...PRIMARY_TO_UNIVERSAL]) {
    if (universal === wanted) return fdi;
  }
  throw new RangeError(`Código Universal inválido: ${label}`);
}

/** Cómo se muestra un diente según la notación elegida. */
export const toothLabel = (code: number, notation: Notation): string =>
  notation === 'FDI' ? String(code) : fdiToUniversal(code);

const quadrantTeeth = (quadrant: number, count: number) =>
  Array.from({ length: count }, (_, i) => quadrant * 10 + i + 1);

/** Dientes de un arco, de derecha a izquierda del paciente (como se ve en pantalla). */
export function archTeeth(arch: 'UPPER' | 'LOWER', dentition: 'PERMANENT' | 'PRIMARY'): number[] {
  const upper = dentition === 'PERMANENT' ? [1, 2] : [5, 6];
  const lower = dentition === 'PERMANENT' ? [4, 3] : [8, 7];
  const [right, left] = arch === 'UPPER' ? upper : lower;
  const count = dentition === 'PERMANENT' ? 8 : 5;
  return [...quadrantTeeth(right, count).reverse(), ...quadrantTeeth(left, count)];
}

export function teethFor(dentition: Dentition): number[] {
  const permanent = [...archTeeth('UPPER', 'PERMANENT'), ...archTeeth('LOWER', 'PERMANENT')];
  const primary = [...archTeeth('UPPER', 'PRIMARY'), ...archTeeth('LOWER', 'PRIMARY')];
  if (dentition === 'PERMANENT') return permanent;
  if (dentition === 'PRIMARY') return primary;
  return [...permanent, ...primary];
}

export const isUpperTooth = (code: number) => [1, 2, 5, 6].includes(Math.floor(code / 10));

/** Los dientes de los cuadrantes 1, 4, 5 y 8 quedan a la izquierda de la pantalla: su mesial mira a la derecha. */
export const isOnPatientRight = (code: number) => [1, 4, 5, 8].includes(Math.floor(code / 10));

const position = (code: number) => code % 10;

/** En incisivos y caninos la superficie de masticación se llama "incisal"; en el resto, "oclusal". */
export function usesIncisalEdge(code: number): boolean {
  return position(code) <= 3;
}

export const toothName = (code: number): string => {
  const p = position(code);
  if (isPrimaryTooth(code)) return ['Incisivo central', 'Incisivo lateral', 'Canino', 'Primer molar', 'Segundo molar'][p - 1];
  return [
    'Incisivo central',
    'Incisivo lateral',
    'Canino',
    'Primer premolar',
    'Segundo premolar',
    'Primer molar',
    'Segundo molar',
    'Tercer molar',
  ][p - 1];
};
