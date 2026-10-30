import type { SigningMethod, SigningPurpose, SigningRequest } from '@prisma/client';
import type { Tx } from '../prisma/transaction';

/** Constancia de cómo y cuándo firmó el paciente (o su tutor). */
export interface SigningEvidence {
  method: SigningMethod;
  signerName: string;
  signerRelation: 'PACIENTE' | 'TUTOR';
  signedAt: Date;
  ip: string | null;
  /** Trazo de la firma (solo en pantalla táctil). */
  signatureImage?: Buffer;
  signatureImageKey?: string;
  /** Dónde se envió el código (solo OTP), ya enmascarado. */
  otpSentTo?: string;
  /** Huella SHA-256 que resume toda la evidencia. */
  evidenceHash: string;
}

export interface PreparedDocument {
  key: string;
  hash: string;
}

/**
 * Cada tipo de documento firmable (consentimiento, aprobación de presupuesto) registra un manejador:
 *  - `prepare`: genera y guarda el PDF firmado (fuera de la transacción).
 *  - `commit`: aplica los efectos de dominio en la MISMA transacción que marca la firma.
 */
export interface SigningHandler {
  prepare(request: SigningRequest, evidence: SigningEvidence): Promise<PreparedDocument>;
  commit(
    request: SigningRequest,
    evidence: SigningEvidence,
    document: PreparedDocument,
    tx: Tx,
  ): Promise<void>;
}

export type HandlerRegistry = Map<SigningPurpose, SigningHandler>;
