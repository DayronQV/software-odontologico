import { normalizeText } from '../../common/text';

export interface PrescribedDrug {
  name: string;
  activeIngredient?: string | null;
  /** Familias/ingredientes del catálogo (p. ej. ["penicilina", "betalactámico"]). */
  allergyGroups?: string[];
}

export interface AllergyConflict {
  drug: string;
  allergy: string;
  matchedTerm: string;
}

const MIN_TERM_LENGTH = 4;

/** Dos términos coinciden si uno contiene al otro ("penicilina" ⊂ "penicilinas"). */
function termsMatch(a: string, b: string): boolean {
  return a.length >= MIN_TERM_LENGTH && b.length >= MIN_TERM_LENGTH && (a.includes(b) || b.includes(a));
}

/**
 * Cruza los fármacos de una receta con las alergias de la anamnesis (RF-02 + recetas).
 * Compara sin distinguir mayúsculas ni acentos contra el nombre, el principio activo y las familias.
 */
export function findAllergyConflicts(drugs: PrescribedDrug[], allergies: string[]): AllergyConflict[] {
  const conflicts: AllergyConflict[] = [];
  const normalizedAllergies = allergies.map((a) => ({ original: a, normalized: normalizeText(a) }));
  for (const drug of drugs) {
    const terms = [drug.name, drug.activeIngredient ?? '', ...(drug.allergyGroups ?? [])]
      .map(normalizeText)
      .filter(Boolean);
    for (const allergy of normalizedAllergies) {
      const matched = terms.find((term) => termsMatch(term, allergy.normalized));
      if (matched) {
        conflicts.push({ drug: drug.name, allergy: allergy.original, matchedTerm: matched });
      }
    }
  }
  return conflicts;
}
