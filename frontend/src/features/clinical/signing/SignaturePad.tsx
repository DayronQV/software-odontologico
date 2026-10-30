import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from '../../../components/ui/Button';

export interface SignatureResult {
  /** PNG en data URL. */
  image: string;
  /** Metadatos biométricos del trazo. */
  strokes: number;
  durationMs: number;
  pointerType: string;
  maxPressure?: number;
}

interface Props {
  onChange: (signature: SignatureResult | null) => void;
  height?: number;
}

/**
 * Lienzo para firmar con el dedo, un lápiz o el mouse (RF-06). Registra el trazo como imagen y,
 * como evidencia, el número de trazos, la duración, el tipo de puntero y la presión máxima.
 */
export function SignaturePad({ onChange, height = 180 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const meta = useRef({ strokes: 0, start: 0, pointerType: 'mouse', maxPressure: 0 });
  const [empty, setEmpty] = useState(true);

  // Ajusta la resolución real del lienzo a su tamaño en pantalla (nítido en tablets de alta densidad)
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth || 600;
    element.width = width * ratio;
    element.height = height * ratio;
    const context = element.getContext?.('2d');
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#0f172a';
    }
  }, [height]);

  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    if (meta.current.strokes === 0) meta.current.start = Date.now();
    meta.current.strokes += 1;
    meta.current.pointerType = event.pointerType || 'mouse';
    const context = canvas.current?.getContext?.('2d');
    const { x, y } = position(event);
    context?.beginPath();
    context?.moveTo(x, y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvas.current?.getContext?.('2d');
    if (!context) return;
    const pressure = event.pressure > 0 ? event.pressure : 0.5;
    meta.current.maxPressure = Math.max(meta.current.maxPressure, event.pressure || 0);
    context.lineWidth = event.pointerType === 'pen' ? 1 + pressure * 3.5 : 2.6;
    const { x, y } = position(event);
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
    setEmpty(false);
  };

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const element = canvas.current;
    if (!element || meta.current.strokes === 0) return;
    onChange({
      image: element.toDataURL('image/png'),
      strokes: meta.current.strokes,
      durationMs: Date.now() - meta.current.start,
      pointerType: meta.current.pointerType,
      maxPressure: meta.current.maxPressure > 0 ? Math.round(meta.current.maxPressure * 100) / 100 : undefined,
    });
  }, [onChange]);

  const clear = () => {
    const element = canvas.current;
    const context = element?.getContext?.('2d');
    if (element && context) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      context.restore();
    }
    meta.current = { strokes: 0, start: 0, pointerType: 'mouse', maxPressure: 0 };
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Área de firma: dibuje su firma con el dedo, el lápiz o el mouse"
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Firme aquí
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={clear} disabled={empty}>Borrar firma</Button>
      </div>
    </div>
  );
}
