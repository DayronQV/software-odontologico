import { archTeeth, toothLabel, type Notation } from '../odontogram/tooth-notation';
import { PERIO_SITES, POCKET_THRESHOLD_MM, siteKey, type PerioDraft, type PerioSite } from './perio-calc';

const BAR_WIDTH = 7;
const GAP = 1.5;
const TOOTH_WIDTH = BAR_WIDTH * 3 + GAP * 2 + 6;
const MAX_MM = 10;
const SCALE = 5.5;

function Face({
  title,
  teeth,
  sites,
  draft,
  notation,
  selectedTooth,
  onSelect,
}: {
  title: string;
  teeth: number[];
  sites: PerioSite[];
  draft: PerioDraft;
  notation: Notation;
  selectedTooth: number | null;
  onSelect: (toothCode: number) => void;
}) {
  const height = MAX_MM * SCALE + 26;
  const width = teeth.length * TOOTH_WIDTH;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-slate-500">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="w-full" preserveAspectRatio="xMinYMid meet">
        {/* Línea de bolsa: a partir de 4 mm hay bolsa periodontal */}
        <line x1="0" x2={width} y1={14 + POCKET_THRESHOLD_MM * SCALE} y2={14 + POCKET_THRESHOLD_MM * SCALE} stroke="#d94f4f" strokeDasharray="3 3" strokeOpacity="0.5" />
        {teeth.map((toothCode, index) => {
          const x0 = index * TOOTH_WIDTH + 3;
          return (
            <g key={toothCode} onClick={() => onSelect(toothCode)} style={{ cursor: 'pointer' }}>
              <rect
                x={x0 - 3}
                y={0}
                width={TOOTH_WIDTH}
                height={height}
                fill={selectedTooth === toothCode ? '#d8eeec' : 'transparent'}
                fillOpacity={0.7}
              />
              {sites.map((site, i) => {
                const reading = draft.sites[siteKey(toothCode, site)];
                const depth = reading && reading.probingDepth !== '' ? Number(reading.probingDepth) : null;
                if (depth === null || Number.isNaN(depth)) return null;
                const barHeight = Math.min(depth, MAX_MM) * SCALE;
                const x = x0 + i * (BAR_WIDTH + GAP);
                const deep = depth >= POCKET_THRESHOLD_MM;
                return (
                  <g key={site}>
                    <rect x={x} y={14} width={BAR_WIDTH} height={barHeight} rx="1.5" fill={deep ? '#d94f4f' : '#52a69f'} />
                    {reading?.bleeding && <circle cx={x + BAR_WIDTH / 2} cy={9} r={2.6} fill="#b91c1c" />}
                  </g>
                );
              })}
              <text x={x0 + (BAR_WIDTH * 3 + GAP * 2) / 2} y={height - 4} textAnchor="middle" fontSize="7" fill="#64748b">
                {toothLabel(toothCode, notation)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Gráfico del examen: barras de profundidad al sondaje por punto (rojo desde 4 mm) y puntos de sangrado. */
export function PerioGraph({
  draft,
  notation,
  selectedTooth,
  onSelect,
}: {
  draft: PerioDraft;
  notation: Notation;
  selectedTooth: number | null;
  onSelect: (toothCode: number) => void;
}) {
  const upper = archTeeth('UPPER', 'PERMANENT');
  const lower = archTeeth('LOWER', 'PERMANENT');
  const common = { draft, notation, selectedTooth, onSelect };
  return (
    <div className="space-y-3" data-testid="perio-graph">
      <div className="grid gap-3 xl:grid-cols-2">
        <Face title="Superior · vestibular" teeth={upper} sites={PERIO_SITES.slice(0, 3)} {...common} />
        <Face title="Superior · lingual / palatino" teeth={upper} sites={PERIO_SITES.slice(3)} {...common} />
        <Face title="Inferior · vestibular" teeth={lower} sites={PERIO_SITES.slice(0, 3)} {...common} />
        <Face title="Inferior · lingual" teeth={lower} sites={PERIO_SITES.slice(3)} {...common} />
      </div>
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#52a69f]" /> Profundidad &lt; 4 mm</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#d94f4f]" /> Bolsa (≥ 4 mm)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#b91c1c]" /> Sangrado al sondaje</span>
      </p>
    </div>
  );
}
