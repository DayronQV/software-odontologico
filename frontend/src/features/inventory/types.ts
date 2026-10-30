export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitCost: number;
  minStock: number;
  active: boolean;
}

export interface StockLocation {
  id: string;
  name: string;
  officeId: string | null;
  professionalId: string | null;
}

export interface StockRow {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  locationId: string;
  location: string;
  quantity: number;
  minStock: number;
  value: number;
  reserved: number;
  belowMinimum: boolean;
}

export interface InventoryAlerts {
  low: Array<{ itemId: string; item: string; unit: string; location: string | null; quantity: number; minStock: number }>;
  expiring: Array<{ itemId: string; item: string; location: string | null; lotCode: string | null; expiresAt: string; state: 'EXPIRED' | 'EXPIRING' }>;
  exceptions: Array<{ id: string; createdAt: string; item: string; location: string | null; missing: number }>;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  ENTRY: 'Entrada',
  ADJUSTMENT: 'Ajuste',
  TRANSFER_OUT: 'Traslado (sale)',
  TRANSFER_IN: 'Traslado (entra)',
  CONSUMPTION: 'Consumo',
  REVERSAL: 'Reversión',
};

export interface Movement {
  id: string;
  createdAt: string;
  type: string;
  item: { code: string; name: string; unit: string };
  location: string;
  quantity: number;
  supplier: string | null;
  lotCode: string | null;
  expiresAt: string | null;
  reason: string | null;
  by: string | null;
}

export interface RecipeProcedure {
  id: string;
  code: string;
  name: string;
  lines: Array<{ itemId: string; item: string; unit: string; quantity: number }>;
}
