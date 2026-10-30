import { Prisma } from '@prisma/client';

/**
 * Los campos Decimal(12,2) de Prisma se serializan por defecto como texto ("12.50").
 * Se exponen como números para que la API sea más cómoda; con 12 dígitos no hay pérdida de precisión.
 */
export function serializeDecimalsAsNumbers(): void {
  (Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (
    this: Prisma.Decimal,
  ) {
    return this.toNumber();
  };
}
