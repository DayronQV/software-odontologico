import { CommissionMode, StockMovementType } from '@prisma/client';
import type { SeedContext } from './seed-context';

const ITEMS = [
  { code: 'RES-A2', name: 'Resina compuesta A2', unit: 'g', unitCost: 1.8, minStock: 20 },
  { code: 'ANE-LID', name: 'Anestesia lidocaína 2 %', unit: 'carpule', unitCost: 0.9, minStock: 30 },
  { code: 'GUA-M', name: 'Guantes de nitrilo', unit: 'par', unitCost: 0.15, minStock: 100 },
  { code: 'ADH-UNI', name: 'Adhesivo universal', unit: 'ml', unitCost: 4.5, minStock: 5 },
  { code: 'LIM-GUT', name: 'Gutapercha', unit: 'cono', unitCost: 0.6, minStock: 40 },
  { code: 'IRR-NAC', name: 'Hipoclorito de sodio 2,5 %', unit: 'ml', unitCost: 0.02, minStock: 200 },
  { code: 'SEL-FIS', name: 'Sellante de fosas y fisuras', unit: 'ml', unitCost: 6, minStock: 3 },
  { code: 'GAS-EST', name: 'Gasas estériles', unit: 'unidad', unitCost: 0.08, minStock: 200 },
];

/** Receta de consumo por código de procedimiento: [código de insumo, cantidad]. */
const RECIPES: Record<string, Array<[string, number]>> = {
  'REST-01': [['RES-A2', 1.5], ['ANE-LID', 1], ['ADH-UNI', 0.1], ['GUA-M', 1]],
  'REST-02': [['RES-A2', 2.5], ['ANE-LID', 1], ['ADH-UNI', 0.15], ['GUA-M', 1]],
  'ENDO-01': [['LIM-GUT', 3], ['ANE-LID', 2], ['IRR-NAC', 10], ['GUA-M', 1]],
  'ENDO-02': [['LIM-GUT', 6], ['ANE-LID', 2], ['IRR-NAC', 20], ['GUA-M', 1]],
  'EXO-01': [['ANE-LID', 2], ['GAS-EST', 6], ['GUA-M', 1]],
  'SELL-01': [['SEL-FIS', 0.3], ['GUA-M', 1]],
  'LIMP-01': [['GUA-M', 1]],
};

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

/** Insumos, recetas de consumo, stock inicial por consultorio y profesional, y reglas de comisión de demostración. */
export interface InventoryOptions {
  adminEmail: string;
  /** Fracción del stock del consultorio que lleva cada profesional (por correo). */
  stockFactor: (email: string) => number;
  /** Porcentaje de comisión general por correo del profesional. */
  commissionPercent: (email: string) => number;
}

const DEV_OPTIONS: InventoryOptions = {
  adminEmail: 'admin@sigo.test',
  stockFactor: (email) => (email === 'odontologo@sigo.test' ? 0.4 : 0.15),
  commissionPercent: (email) => (email === 'odontologo@sigo.test' ? 40 : 45),
};

export async function seedInventory({ prisma }: SeedContext, options: InventoryOptions = DEV_OPTIONS): Promise<void> {
  if ((await prisma.inventoryItem.count()) > 0) return;
  const admin = await prisma.user.findUnique({ where: { email: options.adminEmail } });
  if (!admin) return;

  for (const item of ITEMS) await prisma.inventoryItem.create({ data: item });
  const items = new Map((await prisma.inventoryItem.findMany()).map((i) => [i.code, i]));
  const procedures = new Map((await prisma.procedure.findMany()).map((p) => [p.code, p]));

  for (const [procedureCode, lines] of Object.entries(RECIPES)) {
    const procedure = procedures.get(procedureCode);
    if (!procedure) continue;
    await prisma.consumptionRecipe.createMany({ data: lines.map(([code, quantity]) => ({ procedureId: procedure.id, itemId: items.get(code)!.id, quantity })) });
  }

  // Stock inicial: consultorio principal (con lotes y vencimientos) y los dos profesionales
  const office = await prisma.office.findUnique({ where: { name: 'Consultorio Principal' } });
  const professionals = await prisma.professional.findMany({ include: { user: { select: { email: true, fullName: true } } } });
  const locations = [];
  if (office) locations.push({ ownerKey: 'office', location: await prisma.stockLocation.create({ data: { officeId: office.id, name: `Consultorio: ${office.name}` } }) });
  for (const professional of professionals) {
    locations.push({ ownerKey: professional.user.email, location: await prisma.stockLocation.create({ data: { professionalId: professional.id, name: `Profesional: ${professional.user.fullName}` } }) });
  }
  for (const { ownerKey, location } of locations) {
    const factor = ownerKey === 'office' ? 1 : options.stockFactor(ownerKey);
    let index = 0;
    for (const item of items.values()) {
      index++;
      await prisma.stockMovement.create({
        data: {
          itemId: item.id,
          locationId: location.id,
          type: StockMovementType.ENTRY,
          quantity: Math.round(Number(item.minStock) * 3 * factor * 1000) / 1000,
          unitCost: item.unitCost,
          supplier: 'Dental Proveedores S. A.',
          lotCode: `L-2026-${String(index).padStart(2, '0')}`,
          expiresAt: item.code === 'SEL-FIS' ? daysFromNow(20) : daysFromNow(365),
          createdById: admin.id,
        },
      });
    }
  }

  // Comisiones: general 40 %, coronas sobre el neto (precio − laboratorio − materiales) al 50 %, valoración con monto fijo
  const today = new Date(new Date().getFullYear(), 0, 1);
  const crown = procedures.get('CORO-01');
  const consult = procedures.get('CONS-01');
  for (const professional of professionals) {
    const base = { professionalId: professional.id, validFrom: today };
    await prisma.commissionRule.create({ data: { ...base, mode: CommissionMode.PERCENT, value: options.commissionPercent(professional.user.email) } });
    if (crown) await prisma.commissionRule.create({ data: { ...base, procedureId: crown.id, mode: CommissionMode.PERCENT_NET_OF_COSTS, value: 50, priority: 1 } });
    if (consult) await prisma.commissionRule.create({ data: { ...base, procedureId: consult.id, mode: CommissionMode.FIXED_AMOUNT, value: 8, priority: 1 } });
  }
}
