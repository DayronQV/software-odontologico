import { AlertKind, AlertSeverity } from '@prisma/client';
import { evaluateAlerts, type AlertRuleLike, type HistoryForAlerts } from './alert-evaluator';

const rule = (over: Partial<AlertRuleLike> & Pick<AlertRuleLike, 'kind' | 'label'>): AlertRuleLike => ({
  id: over.label,
  keyword: null,
  severity: AlertSeverity.CRITICAL,
  active: true,
  ...over,
});

const RULES: AlertRuleLike[] = [
  rule({ kind: AlertKind.DRUG_ALLERGY, label: 'Alergia a penicilina', keyword: 'penicilina' }),
  rule({ kind: AlertKind.ANTICOAGULANT, label: 'Paciente anticoagulado' }),
  rule({ kind: AlertKind.COAGULOPATHY, label: 'Coagulopatía' }),
  rule({ kind: AlertKind.SYSTEMIC_DISEASE, label: 'Diabetes', keyword: 'diabetes', severity: AlertSeverity.WARNING }),
];

const history = (over: Partial<HistoryForAlerts> = {}): HistoryForAlerts => ({
  systemicDiseases: [],
  drugAllergies: [],
  coagulopathies: [],
  anticoagulated: false,
  ...over,
});

describe('alertas médicas (RF-02)', () => {
  it('sin anamnesis no hay alertas', () => {
    expect(evaluateAlerts(null, RULES)).toEqual([]);
    expect(evaluateAlerts(undefined, RULES)).toEqual([]);
  });

  it('una anamnesis sin condiciones críticas no genera alertas', () => {
    expect(evaluateAlerts(history({ drugAllergies: ['polen'] }), RULES)).toEqual([]);
  });

  it('detecta alergia a penicilina sin distinguir mayúsculas ni acentos', () => {
    for (const entry of ['Penicilina', 'PENICILÍNA', 'alergia severa a la penicilina G']) {
      const alerts = evaluateAlerts(history({ drugAllergies: [entry] }), RULES);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ label: 'Alergia a penicilina', severity: 'CRITICAL', detail: entry });
    }
  });

  it('detecta pacientes anticoagulados', () => {
    const alerts = evaluateAlerts(history({ anticoagulated: true }), RULES);
    expect(alerts.map((a) => a.label)).toEqual(['Paciente anticoagulado']);
  });

  it('la regla de coagulopatía sin palabra clave se activa con cualquier entrada', () => {
    const alerts = evaluateAlerts(history({ coagulopathies: ['Hemofilia A'] }), RULES);
    expect(alerts[0]).toMatchObject({ label: 'Coagulopatía', detail: 'Hemofilia A' });
    expect(evaluateAlerts(history({ coagulopathies: ['  ', ''] }), RULES)).toEqual([]);
  });

  it('ordena primero las críticas y luego las advertencias', () => {
    const alerts = evaluateAlerts(
      history({ systemicDiseases: ['Diabetes tipo 2'], drugAllergies: ['penicilina'], anticoagulated: true }),
      RULES,
    );
    expect(alerts.map((a) => [a.label, a.severity])).toEqual([
      ['Alergia a penicilina', 'CRITICAL'],
      ['Paciente anticoagulado', 'CRITICAL'],
      ['Diabetes', 'WARNING'],
    ]);
  });

  it('ignora las reglas desactivadas', () => {
    const rules = RULES.map((r) => (r.kind === AlertKind.DRUG_ALLERGY ? { ...r, active: false } : r));
    expect(evaluateAlerts(history({ drugAllergies: ['penicilina'] }), rules)).toEqual([]);
  });
});
