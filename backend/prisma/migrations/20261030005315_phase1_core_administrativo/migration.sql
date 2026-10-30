-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "ProfessionalKind" AS ENUM ('GENERAL', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('DRUG_ALLERGY', 'SYSTEMIC_DISEASE', 'COAGULOPATHY', 'ANTICOAGULANT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'WAITING_ROOM', 'IN_ATTENTION', 'ATTENDED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentOrigin" AS ENUM ('MANUAL', 'TREATMENT_BUDGET');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CONFIRMATION', 'RESCHEDULED', 'REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD_CREDIT', 'CARD_DEBIT', 'TRANSFER', 'INSURANCE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('AUTHORIZED', 'PENDING');

-- CreateEnum
CREATE TYPE "RetentionType" AS ENUM ('IVA', 'RENTA');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('REFUND');

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chair" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ProfessionalKind" NOT NULL DEFAULT 'GENERAL',
    "specialty" TEXT,
    "licenseNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalSchedule" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ProfessionalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "labCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "clinicName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "taxRatePercent" DECIMAL(5,2) NOT NULL,
    "opensAtMinute" INTEGER NOT NULL,
    "closesAtMinute" INTEGER NOT NULL,
    "reminderHours" INTEGER[],
    "maxDiscountPercent" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "keyword" TEXT,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'CRITICAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentId" TEXT,
    "documentHash" TEXT,
    "birthDate" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "preferredChannel" "ContactChannel" NOT NULL DEFAULT 'WHATSAPP',
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "documentId" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInsurance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "validFrom" DATE,
    "validUntil" DATE,
    "coveragePercent" DECIMAL(5,2),

    CONSTRAINT "PatientInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "systemicDiseases" TEXT[],
    "drugAllergies" TEXT[],
    "coagulopathies" TEXT[],
    "surgicalHistory" TEXT,
    "currentMedication" TEXT,
    "anticoagulated" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "chairId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "cancelReason" TEXT,
    "origin" "AppointmentOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentProcedure" (
    "appointmentId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,

    CONSTRAINT "AppointmentProcedure_pkey" PRIMARY KEY ("appointmentId","procedureId")
);

-- CreateTable
CREATE TABLE "AppointmentStatusLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "leadHours" INTEGER,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "recipient" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloat" DECIMAL(12,2) NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "countedCash" DECIMAL(12,2),
    "expectedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "closeNotes" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "issuedById" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL,
    "taxRatePercent" DECIMAL(5,2) NOT NULL,
    "grossTotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "retentionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payableTotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "fiscalStatus" "FiscalStatus" NOT NULL DEFAULT 'PENDING',
    "fiscalProvider" TEXT,
    "fiscalFolio" TEXT,
    "fiscalAuthCode" TEXT,
    "fiscalStampedAt" TIMESTAMP(3),
    "fiscalError" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "procedureId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "gatewayTransactionId" TEXT,
    "gatewayAuthCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRetention" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "RetentionType" NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "issuedById" TEXT NOT NULL,
    "fiscalStatus" "FiscalStatus" NOT NULL DEFAULT 'PENDING',
    "fiscalFolio" TEXT,
    "fiscalAuthCode" TEXT,
    "fiscalStampedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Office_name_key" ON "Office"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Chair_officeId_name_key" ON "Chair"("officeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_userId_key" ON "Professional"("userId");

-- CreateIndex
CREATE INDEX "ProfessionalSchedule_professionalId_idx" ON "ProfessionalSchedule"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_code_key" ON "Procedure"("code");

-- CreateIndex
CREATE INDEX "Procedure_name_idx" ON "Procedure"("name");

-- CreateIndex
CREATE INDEX "Procedure_category_idx" ON "Procedure"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Insurer_name_key" ON "Insurer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_documentHash_key" ON "Patient"("documentHash");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_patientId_key" ON "Guardian"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_patientId_key" ON "EmergencyContact"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientInsurance_patientId_key" ON "PatientInsurance"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalHistory_patientId_key" ON "MedicalHistory"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- CreateIndex
CREATE INDEX "Appointment_chairId_startAt_idx" ON "Appointment"("chairId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_startAt_idx" ON "Appointment"("professionalId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "AppointmentStatusLog_appointmentId_createdAt_idx" ON "AppointmentStatusLog"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_appointmentId_scheduledFor_idx" ON "NotificationLog"("appointmentId", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- CreateIndex
CREATE INDEX "CashSession_openedById_status_idx" ON "CashSession"("openedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_patientId_createdAt_idx" ON "Invoice"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Invoice_cashSessionId_idx" ON "Invoice"("cashSessionId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_cashSessionId_method_idx" ON "Payment"("cashSessionId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_invoiceId_key" ON "CreditNote"("invoiceId");

-- AddForeignKey
ALTER TABLE "Chair" ADD CONSTRAINT "Chair_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalSchedule" ADD CONSTRAINT "ProfessionalSchedule_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_chairId_fkey" FOREIGN KEY ("chairId") REFERENCES "Chair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentProcedure" ADD CONSTRAINT "AppointmentProcedure_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentProcedure" ADD CONSTRAINT "AppointmentProcedure_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentStatusLog" ADD CONSTRAINT "AppointmentStatusLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentStatusLog" ADD CONSTRAINT "AppointmentStatusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRetention" ADD CONSTRAINT "InvoiceRetention_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- RN-03: no pueden existir dos citas ACTIVAS simultáneas en el mismo sillón
-- (aunque cambie el odontólogo). Tampoco para el mismo profesional ni paciente.
-- Las citas canceladas o con inasistencia liberan el horario.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_valid_range" CHECK ("endAt" > "startAt");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_chair_no_overlap"
  EXCLUDE USING gist ("chairId" WITH =, tstzrange("startAt", "endAt") WITH &&)
  WHERE ("status" NOT IN ('CANCELED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus"));

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_professional_no_overlap"
  EXCLUDE USING gist ("professionalId" WITH =, tstzrange("startAt", "endAt") WITH &&)
  WHERE ("status" NOT IN ('CANCELED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus"));

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_patient_no_overlap"
  EXCLUDE USING gist ("patientId" WITH =, tstzrange("startAt", "endAt") WITH &&)
  WHERE ("status" NOT IN ('CANCELED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus"));

-- Un usuario solo puede tener UNA sesión de caja abierta a la vez.
CREATE UNIQUE INDEX "CashSession_one_open_per_user"
  ON "CashSession" ("openedById") WHERE "status" = 'OPEN';

-- Horario laboral coherente
ALTER TABLE "ProfessionalSchedule"
  ADD CONSTRAINT "ProfessionalSchedule_valid_range"
  CHECK ("weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");

-- ============================================================================
-- Los documentos financieros y la bitácora de citas nunca se borran (RN-01 en espíritu).
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_row_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se pueden eliminar', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_no_delete BEFORE DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER invoice_line_no_delete BEFORE DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER credit_note_no_delete BEFORE DELETE ON "CreditNote" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER cash_session_no_delete BEFORE DELETE ON "CashSession" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER cash_movement_no_delete BEFORE DELETE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();
CREATE TRIGGER appointment_status_log_no_delete BEFORE DELETE ON "AppointmentStatusLog" FOR EACH ROW EXECUTE FUNCTION prevent_row_delete();

-- ============================================================================
-- Datos base: parámetros de la clínica y reglas de alerta médica (RF-02)
-- ============================================================================
INSERT INTO "ClinicSettings"
  ("id", "clinicName", "timezone", "currency", "taxRatePercent", "opensAtMinute", "closesAtMinute",
   "reminderHours", "maxDiscountPercent", "updatedAt")
VALUES
  (1, 'Clínica Odontológica SIGO', 'America/Bogota', 'USD', 12, 420, 1260, ARRAY[48, 24], 10, now());

INSERT INTO "AlertRule" ("id", "label", "kind", "keyword", "severity", "active") VALUES
  (gen_random_uuid(), 'Alergia a penicilina',      'DRUG_ALLERGY',     'penicilina',  'CRITICAL', true),
  (gen_random_uuid(), 'Alergia a amoxicilina',     'DRUG_ALLERGY',     'amoxicilina', 'CRITICAL', true),
  (gen_random_uuid(), 'Alergia a anestésicos',     'DRUG_ALLERGY',     'anestesi',    'CRITICAL', true),
  (gen_random_uuid(), 'Paciente anticoagulado',    'ANTICOAGULANT',    NULL,          'CRITICAL', true),
  (gen_random_uuid(), 'Coagulopatía',              'COAGULOPATHY',     NULL,          'CRITICAL', true),
  (gen_random_uuid(), 'Diabetes',                  'SYSTEMIC_DISEASE', 'diabetes',    'WARNING',  true),
  (gen_random_uuid(), 'Hipertensión arterial',     'SYSTEMIC_DISEASE', 'hipertens',   'WARNING',  true),
  (gen_random_uuid(), 'Cardiopatía',               'SYSTEMIC_DISEASE', 'cardio',      'WARNING',  true);
