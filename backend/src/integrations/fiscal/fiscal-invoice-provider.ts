/**
 * Puerto de la facturación electrónica fiscal (SRS §7.1). El SRS no define país ni autoridad
 * tributaria y la emisión real requiere certificados de pago, así que el proyecto usa el
 * adaptador simulado. Para integrar un proveedor real solo se implementa esta interfaz.
 */
export interface FiscalDocument {
  kind: 'INVOICE' | 'CREDIT_NOTE';
  number: number;
  issuedAt: Date;
  currency: string;
  netTotal: number;
  taxTotal: number;
  total: number;
  buyer: { name: string; documentId?: string | null };
  /** Folio fiscal del comprobante original (solo notas de crédito). */
  relatedFolio?: string | null;
}

export interface FiscalAuthorization {
  provider: string;
  folio: string;
  authorizationCode: string;
  stampedAt: Date;
}

export interface FiscalInvoiceProvider {
  authorize(document: FiscalDocument): Promise<FiscalAuthorization>;
}

export const FISCAL_INVOICE_PROVIDER = Symbol('FISCAL_INVOICE_PROVIDER');
