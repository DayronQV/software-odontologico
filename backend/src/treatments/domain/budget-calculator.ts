import { percentOf } from '../../common/money';

/**
 * Cálculo del presupuesto (RF-07), siempre en centavos enteros.
 *  - Honorarios: lo que cobra el profesional por cada ítem.
 *  - Laboratorio: costo que se traslada al paciente tal cual (no se descuenta).
 *  - Descuento: porcentaje autorizado, aplicado SOLO sobre los honorarios, ítem por ítem.
 *  - Total = honorarios − descuento + laboratorio.
 */
export interface BudgetLineInput {
  itemId: string;
  phasePosition: number;
  phaseName: string;
  feeCents: number;
  labCents: number;
}

export interface Amounts {
  feesCents: number;
  labCents: number;
  discountCents: number;
  totalCents: number;
}

export interface PhaseTotals extends Amounts {
  position: number;
  name: string;
}

export interface BudgetTotals extends Amounts {
  phases: PhaseTotals[];
}

const empty = (): Amounts => ({ feesCents: 0, labCents: 0, discountCents: 0, totalCents: 0 });

function addLine(target: Amounts, line: BudgetLineInput, discountPercent: number): void {
  const discount = percentOf(line.feeCents, discountPercent);
  target.feesCents += line.feeCents;
  target.labCents += line.labCents;
  target.discountCents += discount;
  target.totalCents += line.feeCents - discount + line.labCents;
}

export function calculateBudget(lines: BudgetLineInput[], discountPercent: number): BudgetTotals {
  const total = empty();
  const byPhase = new Map<number, PhaseTotals>();
  for (const line of lines) {
    addLine(total, line, discountPercent);
    let phase = byPhase.get(line.phasePosition);
    if (!phase) {
      phase = { ...empty(), position: line.phasePosition, name: line.phaseName };
      byPhase.set(line.phasePosition, phase);
    }
    addLine(phase, line, discountPercent);
  }
  return { ...total, phases: [...byPhase.values()].sort((a, b) => a.position - b.position) };
}

/** Importe que cubre una aprobación parcial: solo los ítems aprobados, con el mismo descuento. */
export function approvedTotal(
  lines: BudgetLineInput[],
  approvedItemIds: ReadonlySet<string>,
  discountPercent: number,
): number {
  return calculateBudget(
    lines.filter((line) => approvedItemIds.has(line.itemId)),
    discountPercent,
  ).totalCents;
}

/** Un descuento por encima del umbral configurado necesita la autorización de un rol con permiso. */
export function requiresDiscountAuthorization(discountPercent: number, thresholdPercent: number): boolean {
  return discountPercent > thresholdPercent;
}
