import { FindingType, ToothSurface } from '@prisma/client';
import { isPermanentTooth, isValidToothCode } from './tooth-notation';

/** Hallazgos que afectan al diente completo (no a una superficie en particular). */
const WHOLE_TOOTH_TYPES: ReadonlySet<FindingType> = new Set([
  FindingType.ENDODONTICS_DONE,
  FindingType.ENDODONTICS_REQUIRED,
  FindingType.IMPLANT,
  FindingType.PROSTHESIS_FIXED,
  FindingType.PROSTHESIS_REMOVABLE,
  FindingType.EXTRACTION,
]);

/** Hallazgos que solo existen en dientes permanentes. */
const PERMANENT_ONLY_TYPES: ReadonlySet<FindingType> = new Set([FindingType.IMPLANT]);

/**
 * Valida que el hallazgo tenga sentido clínico: diente válido, superficie coherente con el tipo
 * (caries/restauración/sellante van en una superficie; endodoncia, implante, prótesis y exodoncia
 * van en el diente completo) y que los implantes solo se registren en dentición permanente.
 * Devuelve el mensaje de error o `null` si es válido.
 */
export function validateFindingTarget(
  toothCode: number,
  surface: ToothSurface,
  type: FindingType,
): string | null {
  if (!isValidToothCode(toothCode)) return `El diente ${toothCode} no existe (use un código FDI)`;
  const whole = surface === ToothSurface.WHOLE;
  if (WHOLE_TOOTH_TYPES.has(type) && !whole) {
    return 'Este hallazgo se registra sobre el diente completo';
  }
  if (!WHOLE_TOOTH_TYPES.has(type) && whole) {
    return 'Este hallazgo se registra sobre una superficie del diente';
  }
  if (PERMANENT_ONLY_TYPES.has(type) && !isPermanentTooth(toothCode)) {
    return 'Los implantes solo se registran en dientes permanentes';
  }
  return null;
}
