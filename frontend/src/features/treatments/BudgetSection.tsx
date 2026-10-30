import { useCallback, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CheckboxField, Field } from '../../components/ui/Field';
import { EmptyState, InlineError, InlineNotice, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { errorMessage, useResource } from '../../lib/useResource';
import { useSettings } from '../catalog/SettingsProvider';
import { useOpenPdf } from '../clinical/shared/useOpenPdf';
import { SigningDialog } from '../clinical/signing/SigningDialog';
import {
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_TONE,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_TONE,
  type Approval,
  type Budget,
} from './types';

/** Presupuestos del plan (RF-07) y su aprobación total o parcial por el paciente (RF-08). */
export function BudgetSection({ planId, patientName, isMinor, guardianName, canEdit, onChanged }: {
  planId: string;
  patientName: string;
  isMinor: boolean;
  guardianName?: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const pdf = useOpenPdf();
  const { settings } = useSettings();
  const money = (value: number) => formatMoney(value, settings.currency);

  const loader = useCallback(() => api<Budget[]>(`/treatment-plans/${planId}/budgets`), [planId]);
  const { data, error, loading, reload } = useResource(loader);

  const [discount, setDiscount] = useState('0');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [signing, setSigning] = useState<Approval | null>(null);

  const current = data?.find((b) => b.status !== 'SUPERSEDED') ?? data?.[0];
  const pendingItemIds = useMemo(
    () => current?.phases.flatMap((p) => p.lines).filter((l) => l.itemStatus === 'PENDING').map((l) => l.itemId) ?? [],
    [current],
  );
  const canApprove = canEdit && current && (current.status === 'OPEN' || current.status === 'PARTIALLY_APPROVED') && pendingItemIds.length > 0;

  const createBudget = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/treatment-plans/${planId}/budgets`, { method: 'POST', body: { discountPercent: Number(discount) || 0 } });
      toast.push('success', 'Presupuesto generado');
      setSelected(new Set());
      await Promise.all([reload(), onChanged()]);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const requestApproval = async (itemIds?: string[]) => {
    if (!current) return;
    setBusy(true);
    setActionError(null);
    try {
      const approval = await api<Approval>(`/budgets/${current.id}/approvals`, { method: 'POST', body: { itemIds } });
      await reload();
      setSigning(approval);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card
      title="Presupuesto"
      description="Honorarios, laboratorio y descuentos autorizados. Cada versión es una foto del plan."
      action={
        canEdit && (
          <div className="flex items-end gap-2">
            <div className="w-36">
              <Field label="Descuento (%)" type="number" min={0} max={100} step="0.5" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </div>
            <Button loading={busy} onClick={() => void createBudget()}>Generar presupuesto</Button>
          </div>
        )
      }
    >
      {loading && !data && <Spinner />}
      {(error || actionError) && <div className="mb-3"><InlineError>{actionError ?? error}</InlineError></div>}
      {data && data.length === 0 && <EmptyState icon="receipt" title="Sin presupuesto" description="Genere el presupuesto cuando el plan esté armado." />}

      {current && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">Versión {current.version}</h3>
            <Badge tone={BUDGET_STATUS_TONE[current.status]}>{BUDGET_STATUS_LABELS[current.status]}</Badge>
            <span className="text-sm text-slate-500">{formatDateTime(current.createdAt)} · {current.createdBy}</span>
            <Button variant="secondary" size="sm" className="ml-auto" loading={pdf.busy === `/budgets/${current.id}/pdf`} onClick={() => void pdf.open(`/budgets/${current.id}/pdf`)}>PDF del presupuesto</Button>
          </div>

          {current.status === 'PENDING_AUTHORIZATION' && (
            <InlineNotice>
              El descuento de {current.discountPercent} % supera el máximo permitido ({settings.maxDiscountPercent} %). El administrador debe autorizarlo antes de presentar el presupuesto al paciente.
            </InlineNotice>
          )}
          {current.discountAuthorization && (
            <p className="text-xs text-slate-500">Descuento autorizado por {current.discountAuthorization.by} · {current.discountAuthorization.note}</p>
          )}

          {current.phases.map((phase) => (
            <section key={phase.position} aria-label={phase.name}>
              <h4 className="mb-1.5 text-sm font-semibold text-slate-800">{phase.name}</h4>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {canApprove && <th className="w-12 px-3 py-2"><span className="sr-only">Aprobar</span></th>}
                      <th className="px-3 py-2">Ítem</th>
                      <th className="px-3 py-2 text-right">Honorarios</th>
                      <th className="px-3 py-2 text-right">Laboratorio</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {phase.lines.map((line) => (
                      <tr key={line.itemId}>
                        {canApprove && (
                          <td className="px-3">
                            {line.itemStatus === 'PENDING' && (
                              <CheckboxField label={<span className="sr-only">Aprobar {line.description}</span>} checked={selected.has(line.itemId)} onChange={() => toggle(line.itemId)} />
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2">{line.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(line.fee)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(line.labCost)}</td>
                        <td className="px-3 py-2"><Badge tone={ITEM_STATUS_TONE[line.itemStatus]}>{ITEM_STATUS_LABELS[line.itemStatus]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-slate-700">
                    <tr>
                      <td colSpan={canApprove ? 5 : 4} className="px-3 py-2 text-right font-medium">Total de la fase: {money(phase.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}

          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Honorarios</dt><dd className="tabular-nums">{money(current.subtotalFees)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Laboratorio</dt><dd className="tabular-nums">{money(current.subtotalLab)}</dd></div>
            {current.discountPercent > 0 && (
              <div className="flex justify-between text-emerald-700"><dt>Descuento ({current.discountPercent} %)</dt><dd className="tabular-nums">−{money(current.discountAmount)}</dd></div>
            )}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-slate-900"><dt>Total</dt><dd className="tabular-nums">{money(current.total)}</dd></div>
          </dl>

          {canApprove && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" loading={busy} disabled={selected.size === 0} onClick={() => void requestApproval([...selected])}>
                Aprobar seleccionados ({selected.size})
              </Button>
              <Button loading={busy} onClick={() => void requestApproval(undefined)}>Aprobación total ({pendingItemIds.length})</Button>
            </div>
          )}

          {current.approvals.length > 0 && (
            <section aria-label="Aprobaciones" className="space-y-2 border-t border-line pt-4">
              <h4 className="text-sm font-semibold text-slate-800">Aprobaciones del paciente</h4>
              {current.approvals.map((approval) => (
                <div key={approval.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span>
                    {approval.itemIds.length} ítem(s) · {money(approval.approvedTotal)}
                    {approval.signing.status === 'SIGNED' && ` · firmó ${approval.signing.signerName} el ${approval.signing.signedAt ? formatDateTime(approval.signing.signedAt) : ''}`}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={approval.signing.status === 'SIGNED' ? 'success' : 'warning'}>{approval.signing.status === 'SIGNED' ? 'Firmada' : 'Pendiente de firma'}</Badge>
                    {approval.signing.status === 'PENDING' && canEdit && (
                      <Button size="sm" onClick={() => void api<Approval>(`/budget-approvals/${approval.id}`).then(setSigning)}>Firmar</Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => void pdf.open(`/budget-approvals/${approval.id}/pdf`)}>PDF</Button>
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {signing && current && (
        <SigningDialog
          open
          title={`Aprobación del presupuesto v${current.version}`}
          signingId={signing.signing.id}
          document={
            <div>
              <p>
                Aprobación de <strong>{signing.itemIds.length}</strong> ítem(s) del plan «{current.planTitle}» por un total de <strong>{money(signing.approvedTotal)}</strong>.
              </p>
              <ul className="mt-2 list-disc pl-5">
                {current.phases.flatMap((p) => p.lines).filter((l) => signing.itemIds.includes(l.itemId)).map((l) => <li key={l.itemId}>{l.description}</li>)}
              </ul>
              <p className="mt-2 text-slate-500">Paciente: {patientName}. Los ítems no marcados siguen pendientes y podrán aprobarse después.</p>
            </div>
          }
          defaultSignerName={isMinor ? (guardianName ?? '') : patientName}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            setSelected(new Set());
            toast.push('success', 'Aprobación firmada: los ítems aprobados ya se pueden agendar');
            void Promise.all([reload(), onChanged()]);
          }}
        />
      )}
    </Card>
  );
}
