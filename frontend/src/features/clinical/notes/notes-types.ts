export interface Addendum {
  id: string;
  content: string;
  author: string | null;
  signedAt: string;
  contentHash: string;
}

export interface EvolutionNote {
  id: string;
  patientId: string;
  appointmentId: string | null;
  kind: 'SOEP' | 'ASSISTANT';
  author: string | null;
  authorId: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  createdAt: string;
  lockAt: string;
  locked: boolean;
  signed: boolean;
  signedAt: string | null;
  signedBy: string | null;
  contentHash: string | null;
  addenda: Addendum[];
}

export interface VitalSignsRecord {
  id: string;
  recordedAt: string;
  recordedBy: string | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperatureC: number | null;
  oxygenSaturation: number | null;
  weightKg: number | null;
  notes: string | null;
}

export const SOEP_FIELDS = [
  { key: 'subjective', label: 'S — Subjetivo', hint: 'Lo que refiere el paciente.' },
  { key: 'objective', label: 'O — Objetivo', hint: 'Hallazgos del examen clínico.' },
  { key: 'assessment', label: 'E — Evaluación', hint: 'Diagnóstico o impresión clínica.' },
  { key: 'plan', label: 'P — Plan', hint: 'Tratamiento y siguientes pasos.' },
] as const;

/** "Editable por 5 h 20 min" / "Bloqueada". */
export function lockCountdown(lockAt: string, now = Date.now()): string {
  const minutes = Math.floor((new Date(lockAt).getTime() - now) / 60_000);
  if (minutes <= 0) return 'Bloqueada';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `Editable por ${hours} h ${minutes % 60} min` : `Editable por ${minutes} min`;
}
