-- CreateEnum
CREATE TYPE "OdontogramDentition" AS ENUM ('PERMANENT', 'PRIMARY', 'MIXED');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('MESIAL', 'DISTAL', 'OCCLUSAL', 'VESTIBULAR', 'LINGUAL', 'WHOLE');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('CARIES', 'RESTORATION', 'ENDODONTICS_DONE', 'ENDODONTICS_REQUIRED', 'IMPLANT', 'PROSTHESIS_FIXED', 'PROSTHESIS_REMOVABLE', 'EXTRACTION', 'SEALANT');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('EXISTING', 'PLANNED', 'DONE');

-- CreateEnum
CREATE TYPE "PerioSite" AS ENUM ('V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('SOEP', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "SigningPurpose" AS ENUM ('CONSENT', 'BUDGET_APPROVAL');

-- CreateEnum
CREATE TYPE "SigningStatus" AS ENUM ('PENDING', 'SIGNED');

-- CreateEnum
CREATE TYPE "SigningMethod" AS ENUM ('TOUCH', 'OTP');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('XRAY', 'PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TreatmentItemStatus" AS ENUM ('PENDING', 'APPROVED', 'SCHEDULED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('PENDING_AUTHORIZATION', 'OPEN', 'PARTIALLY_APPROVED', 'APPROVED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "noteLockHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "Odontogram" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentition" "OdontogramDentition" NOT NULL DEFAULT 'PERMANENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Odontogram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramFinding" (
    "id" TEXT NOT NULL,
    "odontogramId" TEXT NOT NULL,
    "toothCode" INTEGER NOT NULL,
    "surface" "ToothSurface" NOT NULL,
    "type" "FindingType" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'EXISTING',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" TEXT,
    "removedAt" TIMESTAMPTZ(3),
    "removalReason" TEXT,
    "replacesId" TEXT,

    CONSTRAINT "OdontogramFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioChart" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "examinerId" TEXT NOT NULL,
    "examinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "finalizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerioChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioSiteReading" (
    "id" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "toothCode" INTEGER NOT NULL,
    "site" "PerioSite" NOT NULL,
    "probingDepth" INTEGER NOT NULL,
    "gingivalMargin" INTEGER NOT NULL DEFAULT 0,
    "bleeding" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PerioSiteReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioTooth" (
    "chartId" TEXT NOT NULL,
    "toothCode" INTEGER NOT NULL,
    "furcation" INTEGER NOT NULL DEFAULT 0,
    "mobility" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PerioTooth_pkey" PRIMARY KEY ("chartId","toothCode")
);

-- CreateTable
CREATE TABLE "EvolutionNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "procedureRecordId" TEXT,
    "authorId" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL DEFAULT 'SOEP',
    "subjective" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "lockAt" TIMESTAMPTZ(3) NOT NULL,
    "signedAt" TIMESTAMPTZ(3),
    "signedById" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvolutionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalAddendum" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "noteId" TEXT,
    "procedureRecordId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "performedById" TEXT NOT NULL,
    "toothCode" INTEGER,
    "surface" "ToothSurface",
    "notes" TEXT,
    "treatmentItemId" TEXT,
    "performedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSigns" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "recordedById" TEXT NOT NULL,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "temperatureC" DECIMAL(4,1),
    "oxygenSaturation" INTEGER,
    "weightKg" DECIMAL(5,2),
    "notes" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalSigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "purpose" "SigningPurpose" NOT NULL,
    "status" "SigningStatus" NOT NULL DEFAULT 'PENDING',
    "method" "SigningMethod",
    "signerName" TEXT,
    "signerRelation" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMPTZ(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSentTo" TEXT,
    "signatureImageKey" TEXT,
    "signatureMeta" JSONB,
    "evidenceHash" TEXT,
    "signedAt" TIMESTAMPTZ(3),
    "signedIp" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentTemplate" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "treatmentItemId" TEXT,
    "renderedText" TEXT NOT NULL,
    "signingId" TEXT NOT NULL,
    "pdfKey" TEXT,
    "pdfHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT NOT NULL,
    "presentation" TEXT NOT NULL,
    "allergyGroups" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriberId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "diagnosis" TEXT,
    "notes" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
    "allergyOverrideReason" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationId" TEXT,
    "name" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" "AttachmentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPhase" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TreatmentPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "toothCode" INTEGER,
    "surface" "ToothSurface",
    "sessionNumber" INTEGER,
    "fee" DECIMAL(12,2) NOT NULL,
    "labCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "TreatmentItemStatus" NOT NULL DEFAULT 'PENDING',
    "findingId" TEXT,
    "appointmentId" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'OPEN',
    "subtotalFees" DECIMAL(12,2) NOT NULL,
    "subtotalLab" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "discountAuthorizedById" TEXT,
    "discountAuthorizedAt" TIMESTAMPTZ(3),
    "discountAuthorizationNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "phaseName" TEXT NOT NULL,
    "phasePosition" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "toothCode" INTEGER,
    "fee" DECIMAL(12,2) NOT NULL,
    "labCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetApproval" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "signingId" TEXT NOT NULL,
    "itemIds" TEXT[],
    "approvedTotal" DECIMAL(12,2) NOT NULL,
    "pdfKey" TEXT,
    "pdfHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Odontogram_patientId_key" ON "Odontogram"("patientId");

-- CreateIndex
CREATE INDEX "OdontogramFinding_odontogramId_removedAt_idx" ON "OdontogramFinding"("odontogramId", "removedAt");

-- CreateIndex
CREATE INDEX "OdontogramFinding_odontogramId_toothCode_idx" ON "OdontogramFinding"("odontogramId", "toothCode");

-- CreateIndex
CREATE INDEX "PerioChart_patientId_examinedAt_idx" ON "PerioChart"("patientId", "examinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerioSiteReading_chartId_toothCode_site_key" ON "PerioSiteReading"("chartId", "toothCode", "site");

-- CreateIndex
CREATE INDEX "EvolutionNote_patientId_createdAt_idx" ON "EvolutionNote"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_noteId_idx" ON "ClinicalAddendum"("noteId");

-- CreateIndex
CREATE INDEX "ClinicalAddendum_procedureRecordId_idx" ON "ClinicalAddendum"("procedureRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureRecord_treatmentItemId_key" ON "ProcedureRecord"("treatmentItemId");

-- CreateIndex
CREATE INDEX "ProcedureRecord_patientId_performedAt_idx" ON "ProcedureRecord"("patientId", "performedAt");

-- CreateIndex
CREATE INDEX "VitalSigns_patientId_recordedAt_idx" ON "VitalSigns"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "SigningRequest_patientId_status_idx" ON "SigningRequest"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentTemplate_procedureId_version_key" ON "ConsentTemplate"("procedureId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PatientConsent_signingId_key" ON "PatientConsent"("signingId");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_procedureId_idx" ON "PatientConsent"("patientId", "procedureId");

-- CreateIndex
CREATE UNIQUE INDEX "Medication_name_key" ON "Medication"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_number_key" ON "Prescription"("number");

-- CreateIndex
CREATE INDEX "Prescription_patientId_issuedAt_idx" ON "Prescription"("patientId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_patientId_createdAt_idx" ON "Attachment"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_idx" ON "TreatmentPlan"("patientId");

-- CreateIndex
CREATE INDEX "TreatmentPhase_planId_position_idx" ON "TreatmentPhase"("planId", "position");

-- CreateIndex
CREATE INDEX "TreatmentItem_phaseId_idx" ON "TreatmentItem"("phaseId");

-- CreateIndex
CREATE INDEX "TreatmentItem_appointmentId_idx" ON "TreatmentItem"("appointmentId");

-- CreateIndex
CREATE INDEX "TreatmentItem_status_idx" ON "TreatmentItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_planId_version_key" ON "Budget"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_itemId_key" ON "BudgetLine"("budgetId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetApproval_signingId_key" ON "BudgetApproval"("signingId");

-- AddForeignKey
ALTER TABLE "Odontogram" ADD CONSTRAINT "Odontogram_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramFinding" ADD CONSTRAINT "OdontogramFinding_odontogramId_fkey" FOREIGN KEY ("odontogramId") REFERENCES "Odontogram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioChart" ADD CONSTRAINT "PerioChart_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioSiteReading" ADD CONSTRAINT "PerioSiteReading_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "PerioChart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioTooth" ADD CONSTRAINT "PerioTooth_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "PerioChart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolutionNote" ADD CONSTRAINT "EvolutionNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "EvolutionNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAddendum" ADD CONSTRAINT "ClinicalAddendum_procedureRecordId_fkey" FOREIGN KEY ("procedureRecordId") REFERENCES "ProcedureRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureRecord" ADD CONSTRAINT "ProcedureRecord_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSigns" ADD CONSTRAINT "VitalSigns_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningRequest" ADD CONSTRAINT "SigningRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentTemplate" ADD CONSTRAINT "ConsentTemplate_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConsentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_signingId_fkey" FOREIGN KEY ("signingId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPhase" ADD CONSTRAINT "TreatmentPhase_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TreatmentPhase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_signingId_fkey" FOREIGN KEY ("signingId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- FASE 2 — integridad clínica en la base de datos (defensa en profundidad)
-- ============================================================================

-- Códigos FDI válidos: permanentes 11–18, 21–28, 31–38, 41–48; temporales 51–55, 61–65, 71–75, 81–85.
CREATE OR REPLACE FUNCTION is_valid_tooth_code(code integer) RETURNS boolean AS $$
  SELECT code IS NOT NULL AND (
    code BETWEEN 11 AND 18 OR code BETWEEN 21 AND 28 OR code BETWEEN 31 AND 38 OR code BETWEEN 41 AND 48 OR
    code BETWEEN 51 AND 55 OR code BETWEEN 61 AND 65 OR code BETWEEN 71 AND 75 OR code BETWEEN 81 AND 85
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE "OdontogramFinding"
  ADD CONSTRAINT "OdontogramFinding_tooth_valid" CHECK (is_valid_tooth_code("toothCode"));
ALTER TABLE "PerioSiteReading"
  ADD CONSTRAINT "PerioSiteReading_tooth_valid" CHECK (is_valid_tooth_code("toothCode")),
  ADD CONSTRAINT "PerioSiteReading_depth_range" CHECK ("probingDepth" BETWEEN 0 AND 15),
  ADD CONSTRAINT "PerioSiteReading_margin_range" CHECK ("gingivalMargin" BETWEEN -10 AND 15);
ALTER TABLE "PerioTooth"
  ADD CONSTRAINT "PerioTooth_tooth_valid" CHECK (is_valid_tooth_code("toothCode")),
  ADD CONSTRAINT "PerioTooth_furcation_range" CHECK ("furcation" BETWEEN 0 AND 3),
  ADD CONSTRAINT "PerioTooth_mobility_range" CHECK ("mobility" BETWEEN 0 AND 3);
ALTER TABLE "ProcedureRecord"
  ADD CONSTRAINT "ProcedureRecord_tooth_valid" CHECK ("toothCode" IS NULL OR is_valid_tooth_code("toothCode"));
ALTER TABLE "TreatmentItem"
  ADD CONSTRAINT "TreatmentItem_tooth_valid" CHECK ("toothCode" IS NULL OR is_valid_tooth_code("toothCode")),
  ADD CONSTRAINT "TreatmentItem_amounts" CHECK ("fee" >= 0 AND "labCost" >= 0);
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_amounts" CHECK (
    "discountPercent" BETWEEN 0 AND 100 AND "subtotalFees" >= 0 AND "subtotalLab" >= 0 AND "total" >= 0
  );
ALTER TABLE "ClinicSettings"
  ADD CONSTRAINT "ClinicSettings_note_lock_range" CHECK ("noteLockHours" BETWEEN 0 AND 720);
ALTER TABLE "VitalSigns"
  ADD CONSTRAINT "VitalSigns_ranges" CHECK (
    ("systolic" IS NULL OR "systolic" BETWEEN 40 AND 300) AND
    ("diastolic" IS NULL OR "diastolic" BETWEEN 20 AND 200) AND
    ("pulse" IS NULL OR "pulse" BETWEEN 20 AND 250) AND
    ("oxygenSaturation" IS NULL OR "oxygenSaturation" BETWEEN 50 AND 100) AND
    ("temperatureC" IS NULL OR "temperatureC" BETWEEN 30 AND 45) AND
    ("weightKg" IS NULL OR "weightKg" BETWEEN 1 AND 400)
  );
-- Una adenda corrige exactamente UNA cosa: una nota o un procedimiento realizado.
ALTER TABLE "ClinicalAddendum"
  ADD CONSTRAINT "ClinicalAddendum_one_target" CHECK (
    (("noteId" IS NOT NULL)::int + ("procedureRecordId" IS NOT NULL)::int) = 1
  );

-- ----------------------------------------------------------------------------
-- Funciones genéricas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_row_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se pueden modificar', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- RN-01: un procedimiento REALIZADO no se modifica ni se borra; se corrige con adenda firmada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procedure_record_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Un procedimiento realizado no se puede modificar ni eliminar: corríjalo con una adenda firmada (RN-01)'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER procedure_record_no_update BEFORE UPDATE ON "ProcedureRecord"
  FOR EACH ROW EXECUTE FUNCTION procedure_record_immutable();
CREATE TRIGGER procedure_record_no_delete BEFORE DELETE ON "ProcedureRecord"
  FOR EACH ROW EXECUTE FUNCTION procedure_record_immutable();

-- Un ítem de tratamiento ya REALIZADO tampoco cambia ni se elimina; solo se borran los que no avanzaron.
CREATE OR REPLACE FUNCTION treatment_item_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" NOT IN ('PENDING', 'CANCELED') THEN
      RAISE EXCEPTION 'Solo se pueden eliminar ítems pendientes o cancelados (RN-01)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'DONE' THEN
    RAISE EXCEPTION 'Un ítem realizado no se puede modificar (RN-01)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER treatment_item_update_guard BEFORE UPDATE ON "TreatmentItem"
  FOR EACH ROW EXECUTE FUNCTION treatment_item_guard();
CREATE TRIGGER treatment_item_delete_guard BEFORE DELETE ON "TreatmentItem"
  FOR EACH ROW EXECUTE FUNCTION treatment_item_guard();

-- ----------------------------------------------------------------------------
-- Odontograma: el historial es de solo anexar. Lo único que cambia en un hallazgo es su cierre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION odontogram_finding_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."removedAt" IS NOT NULL
     OR (NEW."odontogramId", NEW."toothCode", NEW."surface", NEW."type", NEW."status", NEW."notes",
         NEW."createdById", NEW."createdAt", NEW."replacesId")
        IS DISTINCT FROM
        (OLD."odontogramId", OLD."toothCode", OLD."surface", OLD."type", OLD."status", OLD."notes",
         OLD."createdById", OLD."createdAt", OLD."replacesId") THEN
    RAISE EXCEPTION 'Un hallazgo del odontograma solo puede cerrarse, no modificarse'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER odontogram_finding_update_guard BEFORE UPDATE ON "OdontogramFinding"
  FOR EACH ROW EXECUTE FUNCTION odontogram_finding_guard();
CREATE TRIGGER odontogram_finding_no_delete BEFORE DELETE ON "OdontogramFinding"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();

-- ----------------------------------------------------------------------------
-- Periodontograma: un examen finalizado queda congelado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION perio_chart_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."finalizedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Un periodontograma finalizado no se puede modificar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION perio_child_guard() RETURNS trigger AS $$
DECLARE
  chart_id text;
  frozen timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN chart_id := OLD."chartId"; ELSE chart_id := NEW."chartId"; END IF;
  SELECT "finalizedAt" INTO frozen FROM "PerioChart" WHERE "id" = chart_id;
  IF frozen IS NOT NULL THEN
    RAISE EXCEPTION 'Un periodontograma finalizado no se puede modificar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER perio_chart_update_guard BEFORE UPDATE ON "PerioChart"
  FOR EACH ROW EXECUTE FUNCTION perio_chart_guard();
CREATE TRIGGER perio_chart_no_delete BEFORE DELETE ON "PerioChart"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER perio_site_guard BEFORE INSERT OR UPDATE OR DELETE ON "PerioSiteReading"
  FOR EACH ROW EXECUTE FUNCTION perio_child_guard();
CREATE TRIGGER perio_tooth_guard BEFORE INSERT OR UPDATE OR DELETE ON "PerioTooth"
  FOR EACH ROW EXECUTE FUNCTION perio_child_guard();

-- ----------------------------------------------------------------------------
-- RF-05: nota SOEP. Editable hasta `lockAt`; después solo se puede añadir la firma y corregir por adenda.
-- El bloqueo de la aplicación se refuerza aquí: ni siquiera el SQL directo lo salta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evolution_note_guard() RETURNS trigger AS $$
BEGIN
  IF (NEW."patientId", NEW."authorId", NEW."kind", NEW."lockAt", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."patientId", OLD."authorId", OLD."kind", OLD."lockAt", OLD."createdAt") THEN
    RAISE EXCEPTION 'La autoría, el paciente y el plazo de una nota no se pueden cambiar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF now() >= OLD."lockAt" THEN
    IF (NEW."appointmentId", NEW."procedureRecordId", NEW."subjective", NEW."objective", NEW."assessment", NEW."plan")
       IS DISTINCT FROM
       (OLD."appointmentId", OLD."procedureRecordId", OLD."subjective", OLD."objective", OLD."assessment", OLD."plan")
       OR (OLD."signedAt" IS NOT NULL AND
           (NEW."signedAt", NEW."signedById", NEW."contentHash")
           IS DISTINCT FROM (OLD."signedAt", OLD."signedById", OLD."contentHash")) THEN
      RAISE EXCEPTION 'La nota está bloqueada: solo se corrige con una adenda firmada'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evolution_note_update_guard BEFORE UPDATE ON "EvolutionNote"
  FOR EACH ROW EXECUTE FUNCTION evolution_note_guard();
CREATE TRIGGER evolution_note_no_delete BEFORE DELETE ON "EvolutionNote"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();

-- ----------------------------------------------------------------------------
-- Documentos clínicos e históricos de solo anexar
-- ----------------------------------------------------------------------------
CREATE TRIGGER clinical_addendum_no_update BEFORE UPDATE ON "ClinicalAddendum"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER clinical_addendum_no_delete BEFORE DELETE ON "ClinicalAddendum"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER vital_signs_no_update BEFORE UPDATE ON "VitalSigns"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER vital_signs_no_delete BEFORE DELETE ON "VitalSigns"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER attachment_no_update BEFORE UPDATE ON "Attachment"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER attachment_no_delete BEFORE DELETE ON "Attachment"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER prescription_item_no_update BEFORE UPDATE ON "PrescriptionItem"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER prescription_item_no_delete BEFORE DELETE ON "PrescriptionItem"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER budget_line_no_update BEFORE UPDATE ON "BudgetLine"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_update();
CREATE TRIGGER budget_line_no_delete BEFORE DELETE ON "BudgetLine"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER budget_no_delete BEFORE DELETE ON "Budget"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER budget_approval_no_delete BEFORE DELETE ON "BudgetApproval"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER treatment_plan_no_delete BEFORE DELETE ON "TreatmentPlan"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER patient_consent_no_delete BEFORE DELETE ON "PatientConsent"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER consent_template_no_delete BEFORE DELETE ON "ConsentTemplate"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER signing_request_no_delete BEFORE DELETE ON "SigningRequest"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER prescription_no_delete BEFORE DELETE ON "Prescription"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();

-- Una receta emitida no cambia: lo único permitido es anularla (con motivo).
CREATE OR REPLACE FUNCTION prescription_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'ISSUED' OR NEW."status" <> 'VOIDED'
     OR (NEW."patientId", NEW."prescriberId", NEW."appointmentId", NEW."diagnosis", NEW."notes",
         NEW."allergyOverrideReason", NEW."number", NEW."issuedAt")
        IS DISTINCT FROM
        (OLD."patientId", OLD."prescriberId", OLD."appointmentId", OLD."diagnosis", OLD."notes",
         OLD."allergyOverrideReason", OLD."number", OLD."issuedAt") THEN
    RAISE EXCEPTION 'Una receta emitida no se modifica: solo puede anularse'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prescription_update_guard BEFORE UPDATE ON "Prescription"
  FOR EACH ROW EXECUTE FUNCTION prescription_guard();

-- Firma ya realizada: no se altera (evidencia).
CREATE OR REPLACE FUNCTION signing_request_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'Una firma realizada no se puede modificar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signing_request_update_guard BEFORE UPDATE ON "SigningRequest"
  FOR EACH ROW EXECUTE FUNCTION signing_request_guard();

-- El PDF firmado se adjunta una sola vez y luego no cambia.
CREATE OR REPLACE FUNCTION signed_pdf_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."pdfKey" IS NOT NULL THEN
    RAISE EXCEPTION 'El documento firmado no se puede modificar'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_consent_pdf_guard BEFORE UPDATE ON "PatientConsent"
  FOR EACH ROW EXECUTE FUNCTION signed_pdf_guard();
CREATE TRIGGER budget_approval_pdf_guard BEFORE UPDATE ON "BudgetApproval"
  FOR EACH ROW EXECUTE FUNCTION signed_pdf_guard();

-- El texto legal de una versión de plantilla es inmutable; solo se puede desactivar.
CREATE OR REPLACE FUNCTION consent_template_guard() RETURNS trigger AS $$
BEGIN
  IF (NEW."procedureId", NEW."version", NEW."title", NEW."body")
     IS DISTINCT FROM (OLD."procedureId", OLD."version", OLD."title", OLD."body") THEN
    RAISE EXCEPTION 'Una versión de plantilla no se edita: cree una versión nueva'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_template_update_guard BEFORE UPDATE ON "ConsentTemplate"
  FOR EACH ROW EXECUTE FUNCTION consent_template_guard();

-- ----------------------------------------------------------------------------
-- TRUNCATE no dispara los triggers por fila: se bloquea aparte en las tablas clínicas inmutables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'No se permite vaciar la tabla %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER procedure_record_no_truncate BEFORE TRUNCATE ON "ProcedureRecord" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER evolution_note_no_truncate BEFORE TRUNCATE ON "EvolutionNote" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER clinical_addendum_no_truncate BEFORE TRUNCATE ON "ClinicalAddendum" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER odontogram_finding_no_truncate BEFORE TRUNCATE ON "OdontogramFinding" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER prescription_no_truncate BEFORE TRUNCATE ON "Prescription" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER patient_consent_no_truncate BEFORE TRUNCATE ON "PatientConsent" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER signing_request_no_truncate BEFORE TRUNCATE ON "SigningRequest" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER vital_signs_no_truncate BEFORE TRUNCATE ON "VitalSigns" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER attachment_no_truncate BEFORE TRUNCATE ON "Attachment" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER treatment_item_no_truncate BEFORE TRUNCATE ON "TreatmentItem" FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
