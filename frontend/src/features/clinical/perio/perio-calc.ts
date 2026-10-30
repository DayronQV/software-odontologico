/** Cálculos del periodontograma en el cliente (el servidor repite y valida los mismos). */
export type PerioSite = 'V_MESIAL' | 'V_MIDDLE' | 'V_DISTAL' | 'L_MESIAL' | 'L_MIDDLE' | 'L_DISTAL';

export const PERIO_SITES: PerioSite[] = ['V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL'];
export const VESTIBULAR_SITES = PERIO_SITES.slice(0, 3);
export const LINGUAL_SITES = PERIO_SITES.slice(3);

export const SITE_LABELS: Record<PerioSite, string> = {
  V_MESIAL: 'Mesial',
  V_MIDDLE: 'Medio',
  V_DISTAL: 'Distal',
  L_MESIAL: 'Mesial',
  L_MIDDLE: 'Medio',
  L_DISTAL: 'Distal',
};

export const POCKET_THRESHOLD_MM = 4;

/** NIC = profundidad al sondaje + recesión (margen gingival). */
export const clinicalAttachmentLevel = (probingDepth: number, gingivalMargin: number) => probingDepth + gingivalMargin;

export interface SiteDraft {
  /** Texto del campo: vacío = sin medir. */
  probingDepth: string;
  gingivalMargin: string;
  bleeding: boolean;
}

export interface ToothDraft {
  furcation: number;
  mobility: number;
}

export interface PerioDraft {
  notes: string;
  sites: Record<string, SiteDraft>;
  teeth: Record<number, ToothDraft>;
}

export const siteKey = (toothCode: number, site: PerioSite) => `${toothCode}:${site}`;
export const EMPTY_DRAFT: PerioDraft = { notes: '', sites: {}, teeth: {} };

const toNumber = (text: string): number | null => {
  if (text.trim() === '' || text === '-') return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
};

/** NIC de un punto del borrador, o `null` si todavía falta la profundidad. */
export function draftAttachmentLevel(draft: SiteDraft | undefined): number | null {
  const depth = draft ? toNumber(draft.probingDepth) : null;
  if (depth === null) return null;
  return clinicalAttachmentLevel(depth, toNumber(draft!.gingivalMargin) ?? 0);
}

export interface Measured {
  toothCode: number;
  site: PerioSite;
  probingDepth: number;
  gingivalMargin: number;
  bleeding: boolean;
}

/** Puntos con profundidad registrada (los demás se consideran sin medir). */
export function measuredSites(draft: PerioDraft): Measured[] {
  const result: Measured[] = [];
  for (const [key, site] of Object.entries(draft.sites)) {
    const depth = toNumber(site.probingDepth);
    if (depth === null) continue;
    const [tooth, name] = key.split(':');
    result.push({
      toothCode: Number(tooth),
      site: name as PerioSite,
      probingDepth: depth,
      gingivalMargin: toNumber(site.gingivalMargin) ?? 0,
      bleeding: site.bleeding,
    });
  }
  return result;
}

export interface Summary {
  sites: number;
  bleedingPercent: number;
  pocketPercent: number;
  meanProbingDepth: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function summarize(measured: Pick<Measured, 'probingDepth' | 'bleeding'>[]): Summary {
  const total = measured.length;
  if (total === 0) return { sites: 0, bleedingPercent: 0, pocketPercent: 0, meanProbingDepth: 0 };
  const bleeding = measured.filter((m) => m.bleeding).length;
  const pockets = measured.filter((m) => m.probingDepth >= POCKET_THRESHOLD_MM).length;
  return {
    sites: total,
    bleedingPercent: round1((bleeding / total) * 100),
    pocketPercent: round1((pockets / total) * 100),
    meanProbingDepth: round1(measured.reduce((sum, m) => sum + m.probingDepth, 0) / total),
  };
}

/** Un diente está completo cuando sus 6 puntos tienen profundidad. */
export function toothProgress(draft: PerioDraft, toothCode: number): 'EMPTY' | 'PARTIAL' | 'COMPLETE' {
  const filled = PERIO_SITES.filter((site) => toNumber(draft.sites[siteKey(toothCode, site)]?.probingDepth ?? '') !== null).length;
  if (filled === 0) return 'EMPTY';
  return filled === PERIO_SITES.length ? 'COMPLETE' : 'PARTIAL';
}

/** Cuerpo para la API a partir del borrador. */
export function toPayload(draft: PerioDraft) {
  const sites = measuredSites(draft);
  const toothCodes = new Set(sites.map((s) => s.toothCode));
  for (const code of Object.keys(draft.teeth).map(Number)) {
    const tooth = draft.teeth[code];
    if (tooth.furcation > 0 || tooth.mobility > 0) toothCodes.add(code);
  }
  return {
    notes: draft.notes.trim() || undefined,
    sites,
    teeth: [...toothCodes].map((toothCode) => ({
      toothCode,
      furcation: draft.teeth[toothCode]?.furcation ?? 0,
      mobility: draft.teeth[toothCode]?.mobility ?? 0,
    })),
  };
}

export interface ChartResponse {
  id: string;
  examinedAt: string;
  examiner: string | null;
  notes: string | null;
  finalized: boolean;
  sites: Array<Measured & { attachmentLevel: number }>;
  teeth: Array<{ toothCode: number; furcation: number; mobility: number }>;
  summary: Summary & { teeth: number; bleedingSites: number; pocketSites: number; meanAttachmentLevel: number };
}

export function draftFromChart(chart: ChartResponse): PerioDraft {
  const sites: Record<string, SiteDraft> = {};
  for (const s of chart.sites) {
    sites[siteKey(s.toothCode, s.site)] = {
      probingDepth: String(s.probingDepth),
      gingivalMargin: String(s.gingivalMargin),
      bleeding: s.bleeding,
    };
  }
  const teeth: Record<number, ToothDraft> = {};
  for (const t of chart.teeth) teeth[t.toothCode] = { furcation: t.furcation, mobility: t.mobility };
  return { notes: chart.notes ?? '', sites, teeth };
}
