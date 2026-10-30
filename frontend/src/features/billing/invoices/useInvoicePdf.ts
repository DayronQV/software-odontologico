import { useState } from 'react';
import { useToast } from '../../../components/ui/Toast';
import { apiBlob } from '../../../lib/api';
import { errorMessage } from '../../../lib/useResource';

/** Descarga el PDF con la sesión actual y lo abre en una pestaña nueva. */
export function useInvoicePdf() {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = async (invoiceId: string) => {
    setBusyId(invoiceId);
    try {
      const blob = await apiBlob(`/billing/invoices/${invoiceId}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.push('error', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return { open, busyId };
}
