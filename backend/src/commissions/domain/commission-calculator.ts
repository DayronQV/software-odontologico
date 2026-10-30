import { percentOf, toCents } from '../../common/money';

export type CommissionModeName = 'PERCENT' | 'FIXED_AMOUNT' | 'PERCENT_NET_OF_COSTS';

export interface RuleLike {
  id: string;
  procedureId: string | null;
  mode: CommissionModeName;
  value: number;
  validFrom: Date;
  validTo: Date | null;
  priority: number;
  active: boolean;
}

/**
 * Regla vigente para un procedimiento en una fecha. Con varias vigentes gana la de mayor prioridad;
 * si empatan, la específica del procedimiento sobre la general, y luego la de vigencia más reciente.
 */
export function selectRule<T extends RuleLike>(rules: T[], procedureId: string | null, at: Date): T | null {
  const day = at.getTime();
  const applicable = rules.filter(
    (r) =>
      r.active &&
      r.validFrom.getTime() <= day &&
      (!r.validTo || r.validTo.getTime() + 86_399_999 >= day) &&
      (r.procedureId === null || r.procedureId === procedureId),
  );
  applicable.sort(
    (a, b) =>
      b.priority - a.priority ||
      Number(b.procedureId !== null) - Number(a.procedureId !== null) ||
      b.validFrom.getTime() - a.validFrom.getTime(),
  );
  return applicable[0] ?? null;
}

export interface CommissionInput {
  mode: CommissionModeName;
  value: number;
  /** Valor cobrado (neto de descuentos, sin impuestos), en centavos. */
  baseCents: number;
  labCents: number;
  materialsCents: number;
  quantity: number;
}

export interface CommissionResult {
  /** Base sobre la que se calculó (el precio menos costos en la modalidad neta). */
  calculationBaseCents: number;
  commissionCents: number;
}

/** Las tres modalidades de RF-13. Nunca devuelve una comisión negativa. */
export function calculateCommission(input: CommissionInput): CommissionResult {
  const { mode, value, baseCents, labCents, materialsCents, quantity } = input;
  switch (mode) {
    case 'PERCENT':
      return { calculationBaseCents: baseCents, commissionCents: percentOf(Math.max(0, baseCents), value) };
    case 'FIXED_AMOUNT':
      return { calculationBaseCents: baseCents, commissionCents: toCents(value) * Math.max(1, quantity) };
    case 'PERCENT_NET_OF_COSTS': {
      const net = Math.max(0, baseCents - labCents - materialsCents);
      return { calculationBaseCents: net, commissionCents: percentOf(net, value) };
    }
  }
}
