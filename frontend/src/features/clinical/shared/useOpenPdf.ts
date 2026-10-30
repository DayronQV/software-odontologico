import { useState } from 'react';
import { useToast } from '../../../components/ui/Toast';
import { apiBlob } from '../../../lib/api';
import { errorMessage } from '../../../lib/useResource';

/** Descarga un PDF con la sesión actual (la API exige JWT) y lo abre en una pestaña nueva. */
export function useOpenPdf() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (path: string) => {
    setBusy(path);
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.push('error', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return { open, busy };
}
