import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

interface Options {
  enabled: boolean;
  /** Inactividad total tras la cual se cierra la sesión. */
  timeoutMs: number;
  /** Cuánto antes del cierre se muestra el aviso. */
  warningMs: number;
  /** Intervalo máximo entre avisos al servidor mientras el usuario está activo. */
  keepAliveMs: number;
  onTimeout: () => void;
  onKeepAlive: () => void;
}

/**
 * Cierre automático por inactividad (RNF-05c) con aviso previo, y "keep-alive" hacia el servidor
 * para que su sesión (que también expira por inactividad) no muera antes que la del navegador.
 * Durante el aviso la actividad no cuenta: hay que pulsar "Seguir conectado".
 */
export function useSessionActivity(options: Options) {
  const { enabled, timeoutMs, warningMs, keepAliveMs } = options;
  const onTimeoutRef = useRef(options.onTimeout);
  const onKeepAliveRef = useRef(options.onKeepAlive);
  useEffect(() => {
    onTimeoutRef.current = options.onTimeout;
    onKeepAliveRef.current = options.onKeepAlive;
  });

  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const warningRef = useRef(false);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const stayActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    lastPing.current = now;
    warningRef.current = false;
    setWarning(false);
    onKeepAliveRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const start = Date.now();
    lastActivity.current = start;
    lastPing.current = start;
    warningRef.current = false;
    setWarning(false);

    let lastMark = 0;
    const onActivity = () => {
      const now = Date.now();
      if (warningRef.current || now - lastMark < 1000) return;
      lastMark = now;
      lastActivity.current = now;
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivity.current;

      if (idle >= timeoutMs) {
        clearInterval(timer);
        onTimeoutRef.current();
        return;
      }
      if (idle >= timeoutMs - warningMs) {
        warningRef.current = true;
        setWarning(true);
        setSecondsLeft(Math.ceil((timeoutMs - idle) / 1000));
        return;
      }
      if (now - lastPing.current >= keepAliveMs && lastActivity.current > lastPing.current) {
        lastPing.current = now;
        onKeepAliveRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled, timeoutMs, warningMs, keepAliveMs]);

  return { warning, secondsLeft, stayActive };
}
