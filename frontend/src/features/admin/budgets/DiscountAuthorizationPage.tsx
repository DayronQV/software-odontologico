import { useCallback, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { TextareaField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';
import type { Budget } from '../../treatments/types';

/** Presupuestos con un descuento superior al máximo: solo el administrador puede autorizarlos (RF-07). */
export function DiscountAuthorizationPage() {
  const toast = useToast();
  const { settings } = useSettings();
  const loader = useCallback(() => api<Budget[]>('/budgets/pending-authorization'), []);
  const { data, error, loading, reload } = useResource(loader);
  const [target, setTarget] = useState<Budget | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const money = (value: number) => formatMoney(value, settings.currency);

  const authorize = async () => {
    if (!target) return;
    setBusy(true);
    setFormError(null);
    try {
      await api(`/budgets/${target.id}/authorize-discount`, { method: 'POST', body: { note } });
      toast.push('success', 'Descuento autorizado');
      setTarget(null);
      setNote('');
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Descuentos por autorizar" description={`Los descuentos superiores al ${settings.maxDiscountPercent} % necesitan su autorización antes de presentarse al paciente.`} flush>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <EmptyState icon="shield" title="Nada pendiente" description="No hay presupuestos esperando autorización." />}
      <ul className="divide-y divide-line">
        {data?.map((budget) => (
          <li key={budget.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-slate-900">{budget.planTitle} · versión {budget.version}</p>
              <p className="text-sm text-slate-500">
                Descuento {budget.discountPercent} % ({money(budget.discountAmount)}) sobre honorarios de {money(budget.subtotalFees)} · total {money(budget.total)} · {budget.createdBy} · {formatDateTime(budget.createdAt)}
              </p>
            </div>
            <Button onClick={() => setTarget(budget)}>Autorizar</Button>
          </li>
        ))}
      </ul>

      <Modal open={!!target} onClose={() => setTarget(null)} title="Autorizar descuento">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void authorize();
          }}
        >
          <p className="text-sm text-slate-600">
            {target && `Descuento de ${target.discountPercent} % en «${target.planTitle}». Quedará registrado quién lo autorizó y por qué.`}
          </p>
          <TextareaField label="Motivo de la autorización" rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={note.trim().length < 5}>Autorizar descuento</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
