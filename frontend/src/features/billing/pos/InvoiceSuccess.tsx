import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineNotice } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { formatMoney } from '../../../lib/format';
import { useInvoicePdf } from '../invoices/useInvoicePdf';
import { PAYMENT_LABELS, type InvoiceDetail } from '../types';

export function InvoiceSuccess({ invoice, onNewSale }: { invoice: InvoiceDetail; onNewSale: () => void }) {
  const pdf = useInvoicePdf();
  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-semibold text-slate-900">Comprobante {invoice.displayNumber} emitido</h2>
        <p className="text-sm text-slate-500">
          {invoice.patient.fullName} · {formatMoney(invoice.payableTotal, invoice.currency)}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {invoice.payments.map((p) => (
            <Badge key={p.id} tone="neutral">{PAYMENT_LABELS[p.method]} {formatMoney(p.amount, invoice.currency)}</Badge>
          ))}
        </div>
        {invoice.fiscal.status === 'AUTHORIZED' ? (
          <p className="text-xs text-slate-500">Folio {invoice.fiscal.folio} · autorización {invoice.fiscal.authorizationCode} (simulado)</p>
        ) : (
          <InlineNotice>La autorización fiscal quedó pendiente. Puede reintentarla desde Comprobantes.</InlineNotice>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" loading={pdf.busyId === invoice.id} onClick={() => void pdf.open(invoice.id)}>
            <Icon name="download" className="h-4 w-4" /> Ver PDF
          </Button>
          <Button onClick={onNewSale}>Nueva venta</Button>
        </div>
      </div>
    </Card>
  );
}
