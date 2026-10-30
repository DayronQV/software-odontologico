import { memo } from 'react';
import { FINDING_TYPES, findingPriority, SURFACE_LABELS, type Finding, type ToothSurface } from './findings';
import { SLOT_LABEL_POSITION, SLOT_POINTS, SURFACE_LETTER, surfaceSlots, type SurfaceSlot } from './tooth-geometry';
import { usesIncisalEdge } from './tooth-notation';

const SURFACES: SurfaceSlot[] = ['VESTIBULAR', 'LINGUAL', 'MESIAL', 'DISTAL', 'OCCLUSAL'];

/** El hallazgo que se dibuja en una superficie cuando hay varios: el de mayor prioridad. */
function topFinding(findings: Finding[], surface: ToothSurface): Finding | undefined {
  return findings
    .filter((f) => f.surface === surface)
    .sort((a, b) => findingPriority(a.type) - findingPriority(b.type))[0];
}

interface SurfaceStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  dash?: string;
}

/** Existente: relleno sólido · Planificado: tenue y punteado · Realizado: sólido con trama. */
function surfaceStyle(finding: Finding | undefined): SurfaceStyle {
  if (!finding) return { fill: '#ffffff', fillOpacity: 1, stroke: '#94a3b8' };
  const { color } = FINDING_TYPES[finding.type];
  if (finding.status === 'PLANNED') return { fill: color, fillOpacity: 0.3, stroke: color, dash: '3 2' };
  return { fill: color, fillOpacity: 1, stroke: color };
}

/** Marcas del diente completo: exodoncia, implante, endodoncia y prótesis. */
function WholeToothMarks({ finding }: { finding: Finding }) {
  const { color } = FINDING_TYPES[finding.type];
  const planned = finding.status === 'PLANNED';
  const common = {
    stroke: color,
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    fill: 'none',
    opacity: planned ? 0.6 : 1,
    strokeDasharray: planned ? '4 3' : undefined,
    pointerEvents: 'none' as const,
  };
  switch (finding.type) {
    case 'EXTRACTION':
      return (
        <g {...common}>
          <path d="M5 5 43 43M43 5 5 43" />
        </g>
      );
    case 'IMPLANT':
      return (
        <g {...common} strokeWidth={2.6}>
          <path d="M24 6v36M16 14h16M17 21h14M18 28h12M20 35h8" />
        </g>
      );
    case 'ENDODONTICS_DONE':
    case 'ENDODONTICS_REQUIRED':
      return (
        <g {...common}>
          <path d="M24 5v38" />
          <circle cx="24" cy="43" r="2.4" fill={color} />
        </g>
      );
    case 'PROSTHESIS_FIXED':
      return <rect x="3" y="3" width="42" height="42" rx="6" {...common} strokeWidth={4} />;
    case 'PROSTHESIS_REMOVABLE':
      return <rect x="3" y="3" width="42" height="42" rx="6" {...common} strokeWidth={3} strokeDasharray="6 4" />;
    default:
      return null;
  }
}

interface ToothShapeProps {
  toothCode: number;
  findings: Finding[];
  /** Tamaño en píxeles del cuadro. */
  size?: number;
  /** Superficie resaltada (editor grande). */
  selectedSurface?: ToothSurface | null;
  /** Si se define, cada superficie es un botón táctil (editor grande). */
  onSurfaceSelect?: (surface: SurfaceSlot) => void;
  /** Rotula cada superficie con su letra. */
  showLabels?: boolean;
}

/** Un diente con sus 5 superficies y las marcas de diente completo. Es solo dibujo: no sabe de datos. */
function ToothShapeBase({
  toothCode,
  findings,
  size = 40,
  selectedSurface,
  onSurfaceSelect,
  showLabels = false,
}: ToothShapeProps) {
  const slots = surfaceSlots(toothCode);
  const wholeFindings = findings.filter((f) => f.surface === 'WHOLE');
  const extracted = wholeFindings.some((f) => f.type === 'EXTRACTION' && f.status !== 'PLANNED');
  const incisal = usesIncisalEdge(toothCode);

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={`Diente ${toothCode}`}
      className="block overflow-visible"
      style={{ opacity: extracted ? 0.55 : 1 }}
    >
      {SURFACES.map((surface) => {
        const slot = slots[surface];
        const finding = topFinding(findings, surface);
        const style = surfaceStyle(finding);
        const visual = finding ? FINDING_TYPES[finding.type] : null;
        const isSelected = selectedSurface === surface;
        const label = surface === 'OCCLUSAL' && incisal ? 'Incisal' : SURFACE_LABELS[surface];
        const interactive = !!onSurfaceSelect;
        return (
          <g
            key={surface}
            data-surface={surface}
            {...(interactive
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${label}${finding ? `: ${FINDING_TYPES[finding.type].label}` : ''}`,
                  'aria-pressed': isSelected,
                  onClick: () => onSurfaceSelect(surface),
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSurfaceSelect(surface);
                    }
                  },
                  style: { cursor: 'pointer' },
                }
              : {})}
          >
            <polygon
              points={SLOT_POINTS[slot]}
              fill={style.fill}
              fillOpacity={style.fillOpacity}
              stroke={isSelected ? '#245c5a' : style.stroke}
              strokeWidth={isSelected ? 2.6 : 1}
              strokeDasharray={style.dash}
              strokeLinejoin="round"
            />
            {finding && visual && visual.pattern !== 'solid' && (
              <polygon
                points={SLOT_POINTS[slot]}
                fill={`url(#pat-${visual.pattern})`}
                opacity={finding.status === 'PLANNED' ? 0.5 : 1}
                pointerEvents="none"
              />
            )}
            {showLabels && (
              <text
                x={SLOT_LABEL_POSITION[slot][0]}
                y={SLOT_LABEL_POSITION[slot][1]}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="7.5"
                fontWeight="600"
                fill={finding && finding.status !== 'PLANNED' ? '#ffffff' : '#475569'}
                pointerEvents="none"
              >
                {surface === 'OCCLUSAL' && incisal ? 'I' : SURFACE_LETTER[surface]}
              </text>
            )}
          </g>
        );
      })}
      {wholeFindings
        .sort((a, b) => findingPriority(a.type) - findingPriority(b.type))
        .map((finding) => (
          <WholeToothMarks key={finding.id} finding={finding} />
        ))}
      {wholeFindings.some((f) => f.status === 'DONE') && (
        <g pointerEvents="none">
          <circle cx="40" cy="8" r="6.5" fill="#2a716e" />
          <path d="m36.8 8.2 2.2 2.2 4-4.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

const sameFindings = (a: Finding[], b: Finding[]) =>
  a.length === b.length && a.every((f, i) => f.id === b[i].id && f.status === b[i].status && f.type === b[i].type);

/** Memoizado: al cambiar un diente solo se vuelve a dibujar ese (RNF-01). */
export const ToothShape = memo(
  ToothShapeBase,
  (prev, next) =>
    prev.toothCode === next.toothCode &&
    prev.size === next.size &&
    prev.showLabels === next.showLabels &&
    prev.selectedSurface === next.selectedSurface &&
    prev.onSurfaceSelect === next.onSurfaceSelect &&
    sameFindings(prev.findings, next.findings),
);
