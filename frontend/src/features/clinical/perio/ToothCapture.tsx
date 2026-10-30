import { useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { fdiToUniversal, toothName } from '../odontogram/tooth-notation';
import {
  draftAttachmentLevel,
  LINGUAL_SITES,
  siteKey,
  SITE_LABELS,
  VESTIBULAR_SITES,
  type PerioDraft,
  type PerioSite,
  type SiteDraft,
  type ToothDraft,
} from './perio-calc';

const GRADES = ['0', 'I', 'II', 'III'];
const EMPTY_SITE: SiteDraft = { probingDepth: '', gingivalMargin: '', bleeding: false };

/** ¿El texto ya es un valor completo? "1" y "-" esperan otro carácter (10–15, -1…). */
const isComplete = (value: string) => value.length >= 2 || /^[02-9]$/.test(value);

interface Props {
  toothCode: number;
  draft: PerioDraft;
  readOnly: boolean;
  onSite: (toothCode: number, site: PerioSite, patch: Partial<SiteDraft>) => void;
  onTooth: (toothCode: number, patch: Partial<ToothDraft>) => void;
  onNext: () => void;
}

/**
 * Captura rápida de un diente: 6 puntos de sondaje. Al escribir un dígito el cursor avanza solo
 * (profundidades → recesiones → siguiente diente), pensado para el teclado numérico o la tablet.
 */
export function ToothCapture({ toothCode, draft, readOnly, onSite, onTooth, onNext }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const tooth = draft.teeth[toothCode] ?? { furcation: 0, mobility: 0 };

  const focusAfter = (sequence: number) => {
    const inputs = [...(container.current?.querySelectorAll<HTMLInputElement>('input[data-seq]') ?? [])].sort(
      (a, b) => Number(a.dataset.seq) - Number(b.dataset.seq),
    );
    const next = inputs.find((input) => Number(input.dataset.seq) > sequence);
    if (next) {
      next.focus();
      next.select();
    } else {
      onNext();
    }
  };

  const face = (title: string, sites: PerioSite[], offset: number) => (
    <fieldset className="rounded-xl border border-line p-3" key={title}>
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      <div className="grid grid-cols-[5.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-2 text-center">
        <span />
        {sites.map((site) => (
          <span key={site} className="text-xs font-medium text-slate-500">{SITE_LABELS[site]}</span>
        ))}

        <span className="text-left text-xs text-slate-600">Profundidad (mm)</span>
        {sites.map((site, i) => {
          const value = (draft.sites[siteKey(toothCode, site)] ?? EMPTY_SITE).probingDepth;
          const seq = offset + i;
          return (
            <input
              key={site}
              data-seq={seq}
              inputMode="numeric"
              autoComplete="off"
              disabled={readOnly}
              aria-label={`Profundidad ${title.toLowerCase()} ${SITE_LABELS[site].toLowerCase()}`}
              value={value}
              onChange={(event) => {
                const text = event.target.value;
                if (!/^\d{0,2}$/.test(text) || Number(text) > 15) return;
                onSite(toothCode, site, { probingDepth: text });
                if (text && isComplete(text)) focusAfter(seq);
              }}
              onFocus={(event) => event.target.select()}
              className="min-h-11 w-full rounded-lg border border-line bg-white text-center text-base tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
            />
          );
        })}

        <span className="text-left text-xs text-slate-600">Recesión (mm)</span>
        {sites.map((site, i) => {
          const value = (draft.sites[siteKey(toothCode, site)] ?? EMPTY_SITE).gingivalMargin;
          const seq = 100 + offset + i;
          return (
            <input
              key={site}
              data-seq={seq}
              inputMode="numeric"
              autoComplete="off"
              disabled={readOnly}
              aria-label={`Recesión ${title.toLowerCase()} ${SITE_LABELS[site].toLowerCase()}`}
              value={value}
              onChange={(event) => {
                const text = event.target.value;
                if (!/^-?\d{0,2}$/.test(text)) return;
                const number = Number(text);
                if (text !== '' && text !== '-' && (number < -10 || number > 15)) return;
                onSite(toothCode, site, { gingivalMargin: text });
                if (text && isComplete(text.replace('-', ''))) focusAfter(seq);
              }}
              onFocus={(event) => event.target.select()}
              className="min-h-11 w-full rounded-lg border border-line bg-white text-center text-base tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
            />
          );
        })}

        <span className="text-left text-xs text-slate-600">Sangrado</span>
        {sites.map((site) => {
          const bleeding = (draft.sites[siteKey(toothCode, site)] ?? EMPTY_SITE).bleeding;
          return (
            <button
              key={site}
              type="button"
              disabled={readOnly}
              aria-pressed={bleeding}
              aria-label={`Sangrado ${title.toLowerCase()} ${SITE_LABELS[site].toLowerCase()}`}
              onClick={() => onSite(toothCode, site, { bleeding: !bleeding })}
              className={`min-h-11 rounded-lg border text-sm font-medium transition ${
                bleeding ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-line bg-white text-slate-400 hover:bg-slate-50'
              }`}
            >
              {bleeding ? 'Sí' : 'No'}
            </button>
          );
        })}

        <span className="text-left text-xs font-medium text-slate-700">NIC (mm)</span>
        {sites.map((site) => {
          const nic = draftAttachmentLevel(draft.sites[siteKey(toothCode, site)]);
          return (
            <output key={site} aria-label={`NIC ${title.toLowerCase()} ${SITE_LABELS[site].toLowerCase()}`} className="min-h-11 rounded-lg bg-slate-50 py-2.5 text-base font-semibold tabular-nums text-slate-800">
              {nic ?? '—'}
            </output>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div ref={container} className="space-y-4">
      <header>
        <h3 className="text-lg font-semibold text-slate-900">Diente {toothCode}</h3>
        <p className="text-sm text-slate-500">{toothName(toothCode)} · Universal {fdiToUniversal(toothCode)}</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {face('Vestibular', VESTIBULAR_SITES, 0)}
        {face('Lingual / palatino', LINGUAL_SITES, 3)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Furca (grado)
          <select
            disabled={readOnly}
            value={tooth.furcation}
            onChange={(event) => onTooth(toothCode, { furcation: Number(event.target.value) })}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base"
          >
            {GRADES.map((grade, value) => <option key={grade} value={value}>{value === 0 ? 'Sin compromiso' : `Grado ${grade}`}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Movilidad
          <select
            disabled={readOnly}
            value={tooth.mobility}
            onChange={(event) => onTooth(toothCode, { mobility: Number(event.target.value) })}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base"
          >
            {GRADES.map((grade, value) => <option key={grade} value={value}>{value === 0 ? 'Sin movilidad' : `Grado ${grade}`}</option>)}
          </select>
        </label>
      </div>
      {!readOnly && <Button variant="secondary" onClick={onNext}>Siguiente diente</Button>}
    </div>
  );
}
