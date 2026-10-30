import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field, TextareaField } from '../../../components/ui/Field';
import { InlineError, InlineNotice, Spinner } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import type { BlindCashSession, CashCloseResult } from '../types';
import { CloseResult } from './CloseResult';

const openSchema = z.object({ openingFloat: z.number({ message: 'Ingrese el fondo inicial' }).min(0, 'No puede ser negativo').max(1_000_000) });
const closeSchema = z.object({
  countedCash: z.number({ message: 'Ingrese el efectivo contado' }).min(0, 'No puede ser negativo'),
  notes: z.string().max(300).optional(),
});

function OpenCashCard({ onOpened }: { onOpened: () => void }) {
  const toast = useToast();
  const { settings } = useSettings();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof openSchema>>({ resolver: zodResolver(openSchema), defaultValues: { openingFloat: 0 } });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/billing/cash-sessions/open', { method: 'POST', body: values });
      toast.push('success', 'Caja abierta');
      onOpened();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Card title="Abrir caja" description="Registre el efectivo con el que comienza el turno.">
      <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
        <Field label={`Fondo inicial (${settings.currency})`} type="number" step="0.01" inputMode="decimal" error={errors.openingFloat?.message} {...register('openingFloat', { valueAsNumber: true })} />
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" loading={isSubmitting}><Icon name="wallet" className="h-4 w-4" /> Abrir caja</Button>
      </form>
    </Card>
  );
}

/** RN-02: cierre ciego. Se ingresa el conteo físico primero; solo después se ve el total del sistema. */
function CloseCashCard({ session, onClosed }: { session: BlindCashSession; onClosed: (result: CashCloseResult) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof closeSchema>>({ resolver: zodResolver(closeSchema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      onClosed(await api<CashCloseResult>(`/billing/cash-sessions/${session.id}/close`, { method: 'POST', body: { countedCash: values.countedCash, notes: values.notes || undefined } }));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Card title="Cerrar caja" description="Cierre ciego: cuente el efectivo físico. El total del sistema se muestra después de ingresar su conteo.">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        <Field label="Efectivo contado" type="number" step="0.01" inputMode="decimal" error={errors.countedCash?.message} {...register('countedCash', { valueAsNumber: true })} />
        <TextareaField label="Observaciones (opcional)" error={errors.notes?.message} {...register('notes')} />
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" loading={isSubmitting}>Contar y cerrar caja</Button>
      </form>
    </Card>
  );
}

export function CashierView() {
  const { settings } = useSettings();
  const loader = useCallback(() => api<{ session: BlindCashSession | null }>('/billing/cash-sessions/current'), []);
  const { data, error, loading, reload } = useResource(loader);
  const [closed, setClosed] = useState<CashCloseResult | null>(null);

  if (loading && !data) return <Spinner />;
  if (closed) {
    return <CloseResult result={closed} currency={settings.currency} onDone={() => { setClosed(null); void reload(); }} />;
  }
  const session = data?.session ?? null;

  return (
    <div className="space-y-6">
      {error && <InlineError>{error}</InlineError>}
      {!session ? (
        <OpenCashCard onOpened={() => void reload()} />
      ) : (
        <>
          <Card title="Mi caja" action={<Badge tone="success">Abierta</Badge>}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Abierta</dt><dd className="mt-0.5 text-sm text-slate-800">{formatDateTime(session.openedAt)}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Fondo inicial</dt><dd className="mt-0.5 text-sm text-slate-800">{formatMoney(session.openingFloat, settings.currency)}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Comprobantes</dt><dd className="mt-0.5 text-sm text-slate-800">{session.invoiceCount}</dd></div>
            </dl>
            <div className="mt-4"><InlineNotice>Por seguridad, los totales de la caja no se muestran hasta que ingrese el conteo físico al cerrar.</InlineNotice></div>
            <Link to="/billing/pos" className="mt-4 inline-block"><Button variant="secondary"><Icon name="receipt" className="h-4 w-4" /> Ir al punto de venta</Button></Link>
          </Card>
          <CloseCashCard session={session} onClosed={setClosed} />
        </>
      )}
    </div>
  );
}
