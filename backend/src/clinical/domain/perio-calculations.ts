/**
 * Cálculos del periodontograma (RF-04).
 *  - Margen gingival ("recesión"): mm entre la unión cemento-esmalte y el margen de la encía;
 *    positivo = encía retraída, negativo = encía que cubre la corona (agrandamiento).
 *  - NIC (nivel de inserción clínica) = profundidad al sondaje + recesión.
 */
export const POCKET_THRESHOLD_MM = 4;

export function clinicalAttachmentLevel(probingDepth: number, gingivalMargin: number): number {
  return probingDepth + gingivalMargin;
}

export interface SiteReading {
  toothCode: number;
  site: string;
  probingDepth: number;
  gingivalMargin: number;
  bleeding: boolean;
}

export interface PerioSummary {
  sites: number;
  teeth: number;
  bleedingSites: number;
  /** % de puntos con sangrado al sondaje. */
  bleedingPercent: number;
  pocketSites: number;
  /** % de puntos con bolsa (profundidad ≥ 4 mm). */
  pocketPercent: number;
  meanProbingDepth: number;
  meanAttachmentLevel: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const percent = (part: number, total: number) => (total === 0 ? 0 : round1((part / total) * 100));

export function summarizePerio(readings: SiteReading[]): PerioSummary {
  const sites = readings.length;
  const bleedingSites = readings.filter((r) => r.bleeding).length;
  const pocketSites = readings.filter((r) => r.probingDepth >= POCKET_THRESHOLD_MM).length;
  const sum = (pick: (r: SiteReading) => number) => readings.reduce((acc, r) => acc + pick(r), 0);
  return {
    sites,
    teeth: new Set(readings.map((r) => r.toothCode)).size,
    bleedingSites,
    bleedingPercent: percent(bleedingSites, sites),
    pocketSites,
    pocketPercent: percent(pocketSites, sites),
    meanProbingDepth: sites ? round1(sum((r) => r.probingDepth) / sites) : 0,
    meanAttachmentLevel: sites
      ? round1(sum((r) => clinicalAttachmentLevel(r.probingDepth, r.gingivalMargin)) / sites)
      : 0,
  };
}

export interface SiteChange {
  toothCode: number;
  site: string;
  probingDepthBefore: number;
  probingDepthAfter: number;
  /** Positivo = empeoró (más profundo). */
  probingDepthChange: number;
  /** Positivo = más pérdida de inserción. */
  attachmentLevelChange: number;
}

/** Compara dos exámenes punto por punto (solo los puntos presentes en ambos). */
export function compareSites(before: SiteReading[], after: SiteReading[]): SiteChange[] {
  const key = (r: SiteReading) => `${r.toothCode}:${r.site}`;
  const previous = new Map(before.map((r) => [key(r), r]));
  const changes: SiteChange[] = [];
  for (const current of after) {
    const old = previous.get(key(current));
    if (!old) continue;
    changes.push({
      toothCode: current.toothCode,
      site: current.site,
      probingDepthBefore: old.probingDepth,
      probingDepthAfter: current.probingDepth,
      probingDepthChange: current.probingDepth - old.probingDepth,
      attachmentLevelChange:
        clinicalAttachmentLevel(current.probingDepth, current.gingivalMargin) -
        clinicalAttachmentLevel(old.probingDepth, old.gingivalMargin),
    });
  }
  return changes;
}
