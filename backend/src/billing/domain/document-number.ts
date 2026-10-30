/** "F-000123" (comprobante) y "NC-000045" (nota de crédito). */
export const formatInvoiceNumber = (n: number): string => `F-${String(n).padStart(6, '0')}`;
export const formatCreditNoteNumber = (n: number): string => `NC-${String(n).padStart(6, '0')}`;
