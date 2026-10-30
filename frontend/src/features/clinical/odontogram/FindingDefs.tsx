/**
 * Tramas reutilizables (puntos, rayas, cuadrícula) para que cada hallazgo se distinga también sin
 * color. Se define UNA sola vez en el odontograma y los dientes las referencian por id.
 */
export function FindingDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="pat-dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.2" fill="#fff" fillOpacity="0.85" />
        </pattern>
        <pattern id="pat-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" />
        </pattern>
        <pattern id="pat-grid" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0H6M0 0V6" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.1" fill="none" />
        </pattern>
      </defs>
    </svg>
  );
}
