import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icon';
import { formatDateTime, formatMoney } from '../../../lib/format';
import type { CashCloseResult } from '../types';

/** Resultado del cierre: recién ahora se muestran el efectivo esperado y la diferencia (RN-02). */
export function CloseResult({ result, currency, onDone }: { result: CashCloseResult; currency: string; onDone: () => void }) {
  const money = (v: number) => formatMoney(v, currency);
  const diff = Number(result.difference);
  const tone = diff === 0 ? 'text-emerald-700' : 'text-amber-700';
  const message = diff === 0 ? 'La caja cuadra exactamente.' : diff < 0 ? `Faltan ${money(Math.abs(diff))} respecto al sistema.` : `Sobran ${money(diff)} respecto al sistema.`;

  return (
    <Card className="mx-auto max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ${diff === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <Icon name={diff === 0 ? 'check' : 'alert'} className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Caja cerrada</h2>
            <p className="text-sm text-slate-500">{formatDateTime(result.closedAt)}</p>
          </div>
        </div>
        <dl className="space-y-2 rounded-xl border border-line p-4 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Fondo inicial</dt><dd>{money(result.openingFloat)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Efectivo contado por usted</dt><dd className="font-medium">{money(result.countedCash)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Efectivo esperado por el sistema</dt><dd className="font-medium">{money(result.expectedCash)}</dd></div>
          <div className={`flex justify-between border-t border-line pt-2 text-base font-semibold ${tone}`}><dt>Diferencia</dt><dd>{diff > 0 ? '+' : ''}{money(diff)}</dd></div>
        </dl>
        <p className={`text-sm ${tone}`}>{message}</p>
        <div className="flex justify-end"><Button onClick={onDone}>Entendido</Button></div>
      </div>
    </Card>
  );
}
