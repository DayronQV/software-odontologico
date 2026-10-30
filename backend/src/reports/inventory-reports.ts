import { money, periodText, type ReportDefinition, type ReportRunner } from './report.types';

/** Inventario: existencias valorizadas, consumo del período, mermas (ajustes negativos) y próximos vencimientos. */
const inventory: ReportRunner = async (db, f) => {
  const rows = await db.$queryRaw<Array<{ code: string; name: string; unit: string; stock: number; minStock: number; value: number; consumed: number; waste: number; nextExpiry: Date | null }>>`
    SELECT i."code", i."name", i."unit",
      COALESCE((SELECT SUM(m."quantity") FROM "StockMovement" m WHERE m."itemId" = i."id"), 0)::float AS stock,
      i."minStock"::float AS "minStock",
      (COALESCE((SELECT SUM(m."quantity") FROM "StockMovement" m WHERE m."itemId" = i."id"), 0) * i."unitCost")::float AS value,
      COALESCE((SELECT -SUM(m."quantity") FROM "StockMovement" m
                WHERE m."itemId" = i."id" AND m."type" IN ('CONSUMPTION', 'REVERSAL')
                  AND m."createdAt" >= ${f.from} AND m."createdAt" < ${f.to}), 0)::float AS consumed,
      COALESCE((SELECT -SUM(m."quantity") FROM "StockMovement" m
                WHERE m."itemId" = i."id" AND m."type" = 'ADJUSTMENT' AND m."quantity" < 0
                  AND m."createdAt" >= ${f.from} AND m."createdAt" < ${f.to}), 0)::float AS waste,
      (SELECT MIN(m."expiresAt") FROM "StockMovement" m WHERE m."itemId" = i."id" AND m."type" = 'ENTRY' AND m."expiresAt" >= CURRENT_DATE) AS "nextExpiry"
    FROM "InventoryItem" i WHERE i."active" = true ORDER BY i."name"`;
  const out = rows.map((r) => ({
    code: r.code,
    name: r.name,
    unit: r.unit,
    stock: Math.round(r.stock * 1000) / 1000,
    minStock: r.minStock,
    status: r.stock < r.minStock ? 'Bajo mínimo' : 'Normal',
    value: money(r.value),
    consumed: Math.round(r.consumed * 1000) / 1000,
    waste: Math.round(r.waste * 1000) / 1000,
    nextExpiry: r.nextExpiry ? r.nextExpiry.toISOString().slice(0, 10) : null,
  }));
  return {
    key: 'inventory',
    title: 'Inventario',
    subtitle: `Existencias actuales y consumo ${periodText(f).toLowerCase()}`,
    columns: [
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'name', label: 'Insumo', type: 'text' },
      { key: 'unit', label: 'Unidad', type: 'text' },
      { key: 'stock', label: 'Existencia', type: 'number' },
      { key: 'minStock', label: 'Mínimo', type: 'number' },
      { key: 'status', label: 'Estado', type: 'text' },
      { key: 'value', label: 'Valorizado', type: 'money' },
      { key: 'consumed', label: 'Consumido', type: 'number' },
      { key: 'waste', label: 'Mermas', type: 'number' },
      { key: 'nextExpiry', label: 'Próximo vencimiento', type: 'date' },
    ],
    rows: out,
    totals: { name: 'Total', value: money(out.reduce((t, r) => t + r.value, 0)) },
  };
};

export const INVENTORY_REPORTS: ReportDefinition[] = [
  { key: 'inventory', title: 'Inventario', description: 'Existencias, valorización, consumo del período, mermas y vencimientos.', dentist: false, run: inventory },
];
