import { memo, useMemo } from 'react';
import { FindingDefs } from './FindingDefs';
import type { Finding } from './findings';
import { ToothShape } from './ToothShape';
import { archTeeth, toothLabel, type Dentition, type Notation } from './tooth-notation';

interface ToothCellProps {
  toothCode: number;
  findings: Finding[];
  notation: Notation;
  selected: boolean;
  /** Número del diente: del lado exterior del arco (arriba en el superior, abajo en el inferior). */
  labelPosition: 'above' | 'below';
  onSelect: (toothCode: number) => void;
}

const EMPTY: Finding[] = [];

const ToothCell = memo(function ToothCell({ toothCode, findings, notation, selected, labelPosition, onSelect }: ToothCellProps) {
  const label = toothLabel(toothCode, notation);
  const summary = findings.length === 0 ? 'sin hallazgos' : `${findings.length} hallazgo${findings.length === 1 ? '' : 's'}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(toothCode)}
      aria-label={`Diente ${label}, ${summary}`}
      aria-pressed={selected}
      className={`flex min-h-[4.5rem] min-w-[2.75rem] flex-col items-center gap-1 rounded-lg px-0.5 py-1 transition ${
        labelPosition === 'below' ? 'flex-col-reverse' : ''
      } ${selected ? 'bg-brand-100 ring-2 ring-brand-500' : 'hover:bg-slate-100'}`}
    >
      <span className={`text-xs font-semibold tabular-nums ${selected ? 'text-brand-800' : 'text-slate-500'}`}>{label}</span>
      <ToothShape toothCode={toothCode} findings={findings} size={38} />
    </button>
  );
});

interface RowProps {
  title: string;
  arch: 'UPPER' | 'LOWER';
  dentition: 'PERMANENT' | 'PRIMARY';
  byTooth: Map<number, Finding[]>;
  notation: Notation;
  selectedTooth: number | null;
  onSelect: (toothCode: number) => void;
}

function ArchRow({ title, arch, dentition, byTooth, notation, selectedTooth, onSelect }: RowProps) {
  const teeth = archTeeth(arch, dentition);
  const half = teeth.length / 2;
  return (
    <div role="group" aria-label={title} className="flex items-center justify-center">
      {teeth.map((code, index) => (
        <div key={code} className={`flex ${index === half ? 'ml-3 border-l border-dashed border-slate-300 pl-3' : ''}`}>
          <ToothCell
            toothCode={code}
            findings={byTooth.get(code) ?? EMPTY}
            notation={notation}
            selected={selectedTooth === code}
            labelPosition={arch === 'UPPER' ? 'above' : 'below'}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}

interface OdontogramProps {
  findings: Finding[];
  dentition: Dentition;
  notation: Notation;
  selectedTooth: number | null;
  onSelectTooth: (toothCode: number) => void;
}

/** Odontograma completo: 32 permanentes y/o 20 temporales, con la notación elegida (RF-03). */
export function Odontogram({ findings, dentition, notation, selectedTooth, onSelectTooth }: OdontogramProps) {
  const byTooth = useMemo(() => {
    const map = new Map<number, Finding[]>();
    for (const finding of findings) {
      const list = map.get(finding.toothCode);
      if (list) list.push(finding);
      else map.set(finding.toothCode, [finding]);
    }
    return map;
  }, [findings]);

  const showPermanent = dentition !== 'PRIMARY';
  const showPrimary = dentition !== 'PERMANENT';
  const row = { byTooth, notation, selectedTooth, onSelect: onSelectTooth };

  return (
    <div className="overflow-x-auto" data-testid="odontogram">
      <FindingDefs />
      <div className="mx-auto flex w-max min-w-full flex-col gap-1 py-2">
        {showPermanent && (
          <>
            <p className="px-2 text-xs font-medium uppercase tracking-wide text-slate-400">Dentición permanente</p>
            <ArchRow title="Arcada superior permanente" arch="UPPER" dentition="PERMANENT" {...row} />
            <div className="mx-auto my-0.5 h-px w-full max-w-[44rem] bg-line" aria-hidden="true" />
            <ArchRow title="Arcada inferior permanente" arch="LOWER" dentition="PERMANENT" {...row} />
          </>
        )}
        {showPrimary && (
          <>
            <p className="mt-4 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">Dentición temporal</p>
            <ArchRow title="Arcada superior temporal" arch="UPPER" dentition="PRIMARY" {...row} />
            <div className="mx-auto my-0.5 h-px w-full max-w-[28rem] bg-line" aria-hidden="true" />
            <ArchRow title="Arcada inferior temporal" arch="LOWER" dentition="PRIMARY" {...row} />
          </>
        )}
      </div>
    </div>
  );
}
