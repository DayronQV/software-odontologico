import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field, TextareaField } from '../../../components/ui/Field';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { PageHeader } from '../../../components/ui/PageHeader';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import { useProcedures } from '../../catalog/useCatalog';
import { PatientPicker, type PickedPatient } from '../../patients/PatientPicker';
import { InvoiceSuccess } from './InvoiceSuccess';
import { LinesEditor } from './LinesEditor';
import { PaymentsEditor } from './PaymentsEditor';
import { TotalsPanel } from './TotalsPanel';
import {
  buildInvoicePayload,
  calculatePosTotals,
  paidCents,
  paymentsProblem,
  type PosLine,
  type PosPayment,
  type PosRetention,
} from './pos-calculations';
import type { BlindCashSession, InvoiceDetail } from '../types';

/** Punto de venta (RF-12): arma la cuenta, cobra con pagos mixtos y emite el comprobante electrónico (simulado). */
export function PosPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: procedures } = useProcedures();
  const cashLoader = useCallback(() => api<{ session: BlindCashSession | null }>('/billing/cash-sessions/current'), []);
  const { data: cash, loading: loadingCash } = useResource(cashLoader);

  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [lines, setLines] = useState<PosLine[]>([]);
  const [payments, setPayments] = useState<PosPayment[]>([]);
  const [ivaRetention, setIvaRetention] = useState('');
  const [rentaRetention, setRentaRetention] = useState('');
  const [notes, setNotes] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<InvoiceDetail | null>(null);

  const retentions = useMemo<PosRetention[]>(
    () => [
      ...(Number(ivaRetention) > 0 ? [{ type: 'IVA' as const, percent: Number(ivaRetention) }] : []),
      ...(Number(rentaRetention) > 0 ? [{ type: 'RENTA' as const, percent: Number(rentaRetention) }] : []),
    ],
    [ivaRetention, rentaRetention],
  );
  const totals = useMemo(() => calculatePosTotals(lines, settings.taxRatePercent, retentions), [lines, settings.taxRatePercent, retentions]);
  const problem = !patient ? 'Seleccione al paciente' : lines.length === 0 ? 'Agregue al menos un procedimiento' : paymentsProblem(payments, totals.payableCents);

  const reset = () => {
    setPatient(null);
    setLines([]);
    setPayments([]);
    setIvaRetention('');
    setRentaRetention('');
    setNotes('');
    setError(null);
    setIssued(null);
  };

  const issue = async () => {
    if (!patient || problem) return;
    setIssuing(true);
    setError(null);
    try {
      setIssued(await api<InvoiceDetail>('/billing/invoices', { method: 'POST', body: buildInvoicePayload({ patientId: patient.id, lines, payments, retentions, notes }) }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIssuing(false);
    }
  };

  if (loadingCash && !cash) return <Spinner />;
  if (!cash?.session) {
    return (
      <>
        <PageHeader title="Punto de venta" />
        <Card>
          <div className="flex flex-col items-start gap-3">
            <InlineNotice>Debe abrir caja antes de cobrar.</InlineNotice>
            <Link to="/billing/cash"><Button>Ir a Caja</Button></Link>
          </div>
        </Card>
      </>
    );
  }

  if (issued) return (
    <>
      <PageHeader title="Punto de venta" />
      <InvoiceSuccess invoice={issued} onNewSale={reset} />
    </>
  );

  return (
    <>
      <PageHeader title="Punto de venta" description="Cobro con pagos mixtos y comprobante electrónico (simulado)." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Paciente"><PatientPicker label="Buscar paciente" value={patient} onChange={setPatient} /></Card>
          <Card title="Detalle de la venta">
            <LinesEditor lines={lines} procedures={procedures ?? []} currency={settings.currency} maxDiscountPercent={settings.maxDiscountPercent} isAdmin={user?.role === 'ADMIN_TI'} onChange={setLines} />
          </Card>
          <Card title="Pagos" description="La suma debe ser exactamente el total a cobrar.">
            <PaymentsEditor payments={payments} payableCents={totals.payableCents} onChange={setPayments} />
          </Card>
          <Card title="Retenciones y notas" description="Opcional. El cálculo fiscal es simulado.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Retención de IVA (%)" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={ivaRetention} onChange={(e) => setIvaRetention(e.target.value)} />
              <Field label="Retención de renta (%)" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={rentaRetention} onChange={(e) => setRentaRetention(e.target.value)} />
              <div className="sm:col-span-2"><TextareaField label="Notas del comprobante" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Resumen">
            <TotalsPanel totals={totals} paidCents={paidCents(payments)} currency={settings.currency} taxRatePercent={settings.taxRatePercent} />
            {error && <div className="mt-4"><InlineError>{error}</InlineError></div>}
            {problem && <p className="mt-4 text-sm text-slate-500">{problem}</p>}
            <Button className="mt-4 w-full" disabled={!!problem} loading={issuing} onClick={issue}>
              <Icon name="receipt" className="h-4 w-4" /> Cobrar y emitir comprobante
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}
