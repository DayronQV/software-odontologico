import { AlertKind, AlertSeverity } from '@prisma/client';
import { normalizeText } from '../../common/text';

export interface HistoryForAlerts {
  systemicDiseases: string[];
  drugAllergies: string[];
  coagulopathies: string[];
  anticoagulated: boolean;
}

export interface AlertRuleLike {
  id: string;
  label: string;
  kind: AlertKind;
  keyword: string | null;
  severity: AlertSeverity;
  active: boolean;
}

export interface MedicalAlert {
  ruleId: string;
  label: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Lo registrado en la anamnesis que activó la regla. */
  detail?: string;
}

const ENTRIES_BY_KIND: Partial<Record<AlertKind, keyof HistoryForAlerts>> = {
  [AlertKind.DRUG_ALLERGY]: 'drugAllergies',
  [AlertKind.SYSTEMIC_DISEASE]: 'systemicDiseases',
  [AlertKind.COAGULOPATHY]: 'coagulopathies',
};

function matchingEntries(entries: string[], keyword: string | null): string[] {
  const clean = entries.map((e) => e.trim()).filter(Boolean);
  if (!keyword) return clean; // sin palabra clave: cualquier entrada activa la regla
  const needle = normalizeText(keyword);
  return clean.filter((entry) => normalizeText(entry).includes(needle));
}

/**
 * RF-02: obtiene las alertas médicas de un paciente según las reglas configuradas.
 * Las críticas (alergia a penicilina, anticoagulados…) van primero.
 */
export function evaluateAlerts(
  history: HistoryForAlerts | null | undefined,
  rules: AlertRuleLike[],
): MedicalAlert[] {
  if (!history) return [];
  const alerts: MedicalAlert[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const base = { ruleId: rule.id, label: rule.label, kind: rule.kind, severity: rule.severity };

    if (rule.kind === AlertKind.ANTICOAGULANT) {
      if (history.anticoagulated) alerts.push(base);
      continue;
    }
    const field = ENTRIES_BY_KIND[rule.kind];
    if (!field) continue;
    const matches = matchingEntries(history[field] as string[], rule.keyword);
    if (matches.length > 0) alerts.push({ ...base, detail: matches.join(', ') });
  }

  const rank = (s: AlertSeverity) => (s === AlertSeverity.CRITICAL ? 0 : 1);
  return alerts.sort((a, b) => rank(a.severity) - rank(b.severity) || a.label.localeCompare(b.label));
}
