import { FINDING_ORDER, FINDING_TYPES, type FindingStatus, type FindingType, STATUS_LABELS } from './findings';

/** Muestra de color + trama de un tipo de hallazgo (no depende solo del color). */
export function FindingSwatch({ type, status = 'EXISTING' }: { type: FindingType; status?: FindingStatus }) {
  const { color, pattern } = FINDING_TYPES[type];
  const planned = status === 'PLANNED';
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className="shrink-0">
      <rect
        x="1.5"
        y="1.5"
        width="17"
        height="17"
        rx="4"
        fill={color}
        fillOpacity={planned ? 0.3 : 1}
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={planned ? '3 2' : undefined}
      />
      {pattern !== 'solid' && <rect x="1.5" y="1.5" width="17" height="17" rx="4" fill={`url(#pat-${pattern})`} opacity={planned ? 0.5 : 1} />}
    </svg>
  );
}

/** Leyenda visible del odontograma: tipos del catálogo y significado de los estados (las tramas las define <Odontogram>). */
export function OdontogramLegend() {
  return (
    <div className="space-y-3 text-sm" aria-label="Leyenda del odontograma">
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {FINDING_ORDER.map((type) => (
          <li key={type} className="flex items-center gap-2 text-slate-700">
            <FindingSwatch type={type} />
            {FINDING_TYPES[type].label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line pt-3 text-slate-600">
        <li className="flex items-center gap-2">
          <FindingSwatch type="CARIES" />
          <span><strong className="font-medium">{STATUS_LABELS.EXISTING}</strong>: relleno sólido</span>
        </li>
        <li className="flex items-center gap-2">
          <FindingSwatch type="CARIES" status="PLANNED" />
          <span><strong className="font-medium">{STATUS_LABELS.PLANNED}</strong>: tenue y punteado</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
            <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span><strong className="font-medium">{STATUS_LABELS.DONE}</strong>: sólido con marca de verificación</span>
        </li>
      </ul>
    </div>
  );
}
