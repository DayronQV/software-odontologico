import {
  archTeeth,
  fdiToUniversal,
  isPermanentTooth,
  isPrimaryTooth,
  isValidToothCode,
  PERMANENT_TEETH_COUNT,
  PRIMARY_TEETH_COUNT,
  teethFor,
  toothKind,
  universalToFdi,
  usesIncisalEdge,
} from './tooth-notation';

describe('notación dental FDI ↔ Universal (RF-03)', () => {
  const permanent = teethFor('PERMANENT');
  const primary = teethFor('PRIMARY');

  it('hay 32 dientes permanentes y 20 temporales (52 en dentición mixta)', () => {
    expect(permanent).toHaveLength(PERMANENT_TEETH_COUNT);
    expect(primary).toHaveLength(PRIMARY_TEETH_COUNT);
    expect(teethFor('MIXED')).toHaveLength(52);
    expect(new Set(teethFor('MIXED')).size).toBe(52);
  });

  it.each([
    [18, '1'], [11, '8'], [21, '9'], [28, '16'], [38, '17'], [31, '24'], [41, '25'], [48, '32'],
    [55, 'A'], [51, 'E'], [61, 'F'], [65, 'J'], [75, 'K'], [71, 'O'], [81, 'P'], [85, 'T'],
  ])('FDI %i equivale a Universal %s', (fdi, universal) => {
    expect(fdiToUniversal(fdi)).toBe(universal);
    expect(universalToFdi(universal)).toBe(fdi);
  });

  it('la conversión ida y vuelta es exacta para los 52 dientes', () => {
    for (const code of teethFor('MIXED')) {
      expect(universalToFdi(fdiToUniversal(code))).toBe(code);
    }
    const universal = new Set(teethFor('MIXED').map(fdiToUniversal));
    expect(universal.size).toBe(52);
  });

  it('la notación Universal admite minúsculas y espacios', () => {
    expect(universalToFdi(' a ')).toBe(55);
  });

  it('rechaza códigos que no existen', () => {
    for (const bad of [0, 10, 19, 29, 49, 50, 56, 66, 76, 86, 99]) {
      expect(isValidToothCode(bad)).toBe(false);
      expect(() => fdiToUniversal(bad)).toThrow(RangeError);
    }
    expect(() => universalToFdi('33')).toThrow(RangeError);
    expect(() => universalToFdi('U')).toThrow(RangeError);
  });

  it('distingue permanentes de temporales', () => {
    expect(permanent.every(isPermanentTooth)).toBe(true);
    expect(primary.every(isPrimaryTooth)).toBe(true);
    expect(isPermanentTooth(55)).toBe(false);
    expect(isPrimaryTooth(11)).toBe(false);
  });

  it('cada arco se dibuja de derecha a izquierda del paciente', () => {
    expect(archTeeth('UPPER', 'PERMANENT')).toEqual([
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    ]);
    expect(archTeeth('LOWER', 'PERMANENT')).toEqual([
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
    ]);
    expect(archTeeth('UPPER', 'PRIMARY')).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65]);
    expect(archTeeth('LOWER', 'PRIMARY')).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75]);
  });

  it('clasifica el tipo de diente y usa "incisal" solo en incisivos y caninos', () => {
    expect(toothKind(11)).toBe('INCISOR');
    expect(toothKind(13)).toBe('CANINE');
    expect(toothKind(24)).toBe('PREMOLAR');
    expect(toothKind(36)).toBe('MOLAR');
    expect(toothKind(54)).toBe('MOLAR'); // los temporales no tienen premolares
    expect(usesIncisalEdge(12)).toBe(true);
    expect(usesIncisalEdge(43)).toBe(true);
    expect(usesIncisalEdge(15)).toBe(false);
    expect(usesIncisalEdge(46)).toBe(false);
    expect(() => toothKind(99)).toThrow(RangeError);
  });
});
