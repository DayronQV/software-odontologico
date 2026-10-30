-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CONSUMPTION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "StockPolicy" AS ENUM ('ALLOW_WITH_ALERT', 'BLOCK');

-- CreateEnum
CREATE TYPE "SupplyRequestStatus" AS ENUM ('REQUESTED', 'PREPARED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'RECONCILED');

-- CreateEnum
CREATE TYPE "CommissionMode" AS ENUM ('PERCENT', 'FIXED_AMOUNT', 'PERCENT_NET_OF_COSTS');

-- CreateEnum
CREATE TYPE "CommissionEntryKind" AS ENUM ('ACCRUAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "stockPolicy" "StockPolicy" NOT NULL DEFAULT 'ALLOW_WITH_ALERT';

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "minStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeId" TEXT,
    "professionalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "supplier" TEXT,
    "lotCode" TEXT,
    "expiresAt" DATE,
    "reason" TEXT,
    "transferId" TEXT,
    "procedureRecordId" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockException" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "procedureRecordId" TEXT,
    "missing" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionRecipe" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ConsumptionRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRequest" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "SupplyRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "SupplyRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "systemQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3),

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "procedureId" TEXT,
    "mode" "CommissionMode" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "procedureId" TEXT,
    "ruleId" TEXT,
    "kind" "CommissionEntryKind" NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "labCost" DECIMAL(12,2) NOT NULL,
    "materialsCost" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlement" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "professionalId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_officeId_key" ON "StockLocation"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_professionalId_key" ON "StockLocation"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "StockMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_locationId_createdAt_idx" ON "StockMovement"("itemId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_procedureRecordId_idx" ON "StockMovement"("procedureRecordId");

-- CreateIndex
CREATE INDEX "StockMovement_expiresAt_idx" ON "StockMovement"("expiresAt");

-- CreateIndex
CREATE INDEX "StockException_createdAt_idx" ON "StockException"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionRecipe_procedureId_itemId_key" ON "ConsumptionRecipe"("procedureId", "itemId");

-- CreateIndex
CREATE INDEX "SupplyRequest_appointmentId_idx" ON "SupplyRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "SupplyRequest_status_idx" ON "SupplyRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_itemId_key" ON "StockCountLine"("countId", "itemId");

-- CreateIndex
CREATE INDEX "CommissionRule_professionalId_active_idx" ON "CommissionRule"("professionalId", "active");

-- CreateIndex
CREATE INDEX "CommissionEntry_professionalId_createdAt_idx" ON "CommissionEntry"("professionalId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionEntry_invoiceId_idx" ON "CommissionEntry"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEntry_invoiceLineId_kind_key" ON "CommissionEntry"("invoiceLineId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSettlement_number_key" ON "CommissionSettlement"("number");

-- CreateIndex
CREATE INDEX "CommissionSettlement_professionalId_periodStart_idx" ON "CommissionSettlement"("professionalId", "periodStart");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionRecipe" ADD CONSTRAINT "ConsumptionRecipe_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionRecipe" ADD CONSTRAINT "ConsumptionRecipe_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequestLine" ADD CONSTRAINT "SupplyRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CommissionSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- FASE 3 — integridad de inventario y comisiones
-- ============================================================================

-- Una ubicación de stock es de un consultorio O de un profesional.
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_one_owner"
  CHECK (("officeId" IS NOT NULL)::int + ("professionalId" IS NOT NULL)::int = 1);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_amounts" CHECK ("unitCost" >= 0 AND "minStock" >= 0);
ALTER TABLE "ConsumptionRecipe" ADD CONSTRAINT "ConsumptionRecipe_positive" CHECK ("quantity" > 0);
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_value" CHECK ("value" >= 0 AND ("validTo" IS NULL OR "validTo" >= "validFrom"));
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_expiry_days" CHECK ("expiryAlertDays" BETWEEN 1 AND 365);

-- RF-14: el descargo de un procedimiento ocurre UNA sola vez por insumo y ubicación (idempotencia).
CREATE UNIQUE INDEX "StockMovement_consumption_once"
  ON "StockMovement" ("procedureRecordId", "itemId", "locationId") WHERE "type" = 'CONSUMPTION';

-- El kardex no se edita ni se borra: se corrige con un movimiento de ajuste o de reversión.
CREATE TRIGGER stock_movement_no_update BEFORE UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER stock_movement_no_delete BEFORE DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER stock_movement_no_truncate BEFORE TRUNCATE ON "StockMovement" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER stock_exception_no_update BEFORE UPDATE ON "StockException" FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER stock_exception_no_delete BEFORE DELETE ON "StockException" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();

-- Comisiones: una fila devengada solo cambia al asignarse a una liquidación; nunca se borra.
CREATE OR REPLACE FUNCTION commission_entry_guard() RETURNS trigger AS $$
BEGIN
  IF (NEW."professionalId", NEW."invoiceId", NEW."invoiceLineId", NEW."kind", NEW."baseAmount", NEW."labCost", NEW."materialsCost", NEW."amount")
     IS DISTINCT FROM
     (OLD."professionalId", OLD."invoiceId", OLD."invoiceLineId", OLD."kind", OLD."baseAmount", OLD."labCost", OLD."materialsCost", OLD."amount") THEN
    RAISE EXCEPTION 'Una comisión devengada no se modifica: se corrige con una reversión'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER commission_entry_update_guard BEFORE UPDATE ON "CommissionEntry" FOR EACH ROW EXECUTE FUNCTION commission_entry_guard();
CREATE TRIGGER commission_entry_no_delete BEFORE DELETE ON "CommissionEntry" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER commission_entry_no_truncate BEFORE TRUNCATE ON "CommissionEntry" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

-- Una liquidación aprobada o pagada no se borra.
CREATE OR REPLACE FUNCTION settlement_delete_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Una liquidación aprobada o pagada no se puede eliminar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER settlement_no_delete_when_final BEFORE DELETE ON "CommissionSettlement" FOR EACH ROW EXECUTE FUNCTION settlement_delete_guard();
