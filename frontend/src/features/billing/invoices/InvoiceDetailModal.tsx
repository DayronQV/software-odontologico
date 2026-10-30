import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TextareaField } from '../../../components/ui/Field';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { PAYMENT_LABELS, type InvoiceDetail } from '../types';
import { useInvoicePdf } from './useInvoicePdf';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function InvoiceDetailModal({ invoiceId, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const pdf = useInvoicePdf();
  const loader = useCallback(() => (invoiceId ? api<InvoiceDetail>(`/billing/invoices/${invoiceId}`) : Promise.resolve(null)), [invoiceId]);
  const { data: invoice, error, loading, reload } = useResource(loader);

  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await api(path, { method: 'POST', body });
      toast.push('success', success);
      setVoiding(false);
      setReason('');
      await reload();
      onChanged();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const money = (value: number) => formatMoney(value, invoice?.currency);

  return (
    <Modal open={!!invoiceId} title={invoice ? `Comprobante ${invoice.displayNumber}` : 'Comprobante'} onClose={onClose} size="lg">
      {error && <InlineError>{error}</InlineError>}
      {loading && !invoice ? <Spinner /> : invoice && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={invoice.status === 'ISSUED' ? 'success' : 'danger'}>{invoice.status === 'ISSUED' ? 'Emitido' : 'Anulado'}</Badge>
              <Badge tone={invoice.fiscal.status === 'AUTHORIZED' ? 'brand' : 'warning'}>
                {invoice.fiscal.status === 'AUTHORIZED' ? 'Autorizado (simulado)' : 'Autorización fiscal pendiente'}
              </Badge>
            </div>
            <Button variant="secondary" size="sm" loading={pdf.busyId === invoice.id} onClick={() => void pdf.open(invoice.id)}>
              <Icon name="download" className="h-4 w-4" /> Ver PDF
            </Button>
          </div>

          <p className="text-sm text-slate-600">
            {invoice.patient.fullName} · {formatDateTime(invoice.createdAt)} · atendido por {invoice.issuedBy}
          </p>
          {invoice.fiscal.folio && (
            <p className="text-xs text-slate-500">Folio {invoice.fiscal.folio} · autorización {invoice.fiscal.authorizationCode}</p>
          )}
          {invoice.fiscal.status === 'PENDING' && (
            <InlineNotice>
              {invoice.fiscal.error ?? 'Falta autorizar el comprobante.'}{' '}
              <button type="button" className="font-semibold underline" disabled={busy} onClick={() => void run(`/billing/invoices/${invoice.id}/fiscal-retry`, undefined, 'Autorización fiscal reintentada')}>Reintentar</button>
            </InlineNotice>
          )}
          {invoice.void && (
            <InlineError>
              Anulado: {invoice.void.reason}. Nota de crédito {invoice.void.creditNote?.displayNumber} por {money(invoice.void.creditNote?.total ?? 0)}.
            </InlineError>
          )}

          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2 text-left">Detalle</th><th className="px-4 py-2 text-right">Cant.</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoice.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">{l.description}{Number(l.discountPercent) > 0 ? <span className="ml-2 text-xs text-slate-500">(desc. {l.discountPercent}%)</span> : null}</td>
                    <td className="px-4 py-2 text-right">{l.quantity}</td>
                    <td className="px-4 py-2 text-right font-medium">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Pagos</p>
              <ul className="space-y-1 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex justify-between"><span>{PAYMENT_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span><span className="font-medium">{money(p.amount)}</span></li>
                ))}
              </ul>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(invoice.grossTotal)}</dd></div>
              {invoice.discountTotal > 0 && <div className="flex justify-between"><dt className="text-slate-500">Descuentos</dt><dd>− {money(invoice.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-500">Impuestos ({invoice.taxRatePercent}%)</dt><dd>{money(invoice.taxTotal)}</dd></div>
              {invoice.retentions.map((r) => <div key={r.type} className="flex justify-between"><dt className="text-slate-500">Retención {r.type} ({r.percent}%)</dt><dd>− {money(r.amount)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-slate-900"><dt>Cobrado</dt><dd>{money(invoice.payableTotal)}</dd></div>
            </dl>
          </div>

          {user?.role === 'ADMIN_TI' && invoice.status === 'ISSUED' && (
            <div className="border-t border-line pt-4">
              {voiding ? (
                <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                  <TextareaField label="Motivo de la anulación" value={reason} onChange={(e) => setReason(e.target.value)} hint="Se emite una nota de crédito; el comprobante no se borra. El efectivo se devuelve desde su caja abierta." />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setVoiding(false)}>Volver</Button>
                    <Button variant="danger" size="sm" disabled={!reason.trim()} loading={busy} onClick={() => void run(`/billing/invoices/${invoice.id}/void`, { reason: reason.trim() }, 'Comprobante anulado con nota de crédito')}>Anular comprobante</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => setVoiding(true)}>Anular comprobante…</Button>
              )}
            </div>
          )}
          {actionError && <InlineError>{actionError}</InlineError>}
        </div>
      )}
    </Modal>
  );
}
