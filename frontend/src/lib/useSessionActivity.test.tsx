import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionActivity } from './useSessionActivity';

const MIN = 60_000;

function setup(overrides: Partial<Parameters<typeof useSessionActivity>[0]> = {}) {
  const onTimeout = vi.fn();
  const onKeepAlive = vi.fn();
  const hook = renderHook(() =>
    useSessionActivity({
      enabled: true,
      timeoutMs: 15 * MIN,
      warningMs: MIN,
      keepAliveMs: 4 * MIN,
      onTimeout,
      onKeepAlive,
      ...overrides,
    }),
  );
  return { ...hook, onTimeout, onKeepAlive };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('useSessionActivity (RNF-05c: 15 min de inactividad)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cierra la sesión a los 15 minutos sin actividad, con aviso a los 14', () => {
    const { result, onTimeout } = setup();

    advance(13 * MIN + 30_000);
    expect(result.current.warning).toBe(false);

    advance(MIN); // 14.5 min
    expect(result.current.warning).toBe(true);
    expect(result.current.secondsLeft).toBeLessThanOrEqual(60);
    expect(onTimeout).not.toHaveBeenCalled();

    advance(MIN); // > 15 min
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('la actividad del usuario reinicia el contador', () => {
    const { result, onTimeout } = setup();

    advance(10 * MIN);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });
    advance(10 * MIN); // 20 min en total, pero solo 10 desde la última actividad
    expect(result.current.warning).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('"Seguir conectado" cancela el aviso y avisa al servidor', () => {
    const { result, onTimeout, onKeepAlive } = setup();

    advance(14 * MIN + 5_000);
    expect(result.current.warning).toBe(true);

    act(() => result.current.stayActive());
    expect(result.current.warning).toBe(false);
    expect(onKeepAlive).toHaveBeenCalledTimes(1);

    advance(10 * MIN);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('durante el aviso, mover el mouse no cuenta como actividad', () => {
    const { result, onTimeout } = setup();

    advance(14 * MIN + 5_000);
    expect(result.current.warning).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });
    advance(MIN);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('envía keep-alive al servidor solo si hubo actividad', () => {
    const { onKeepAlive } = setup();

    advance(5 * MIN); // sin actividad: no hay ping
    expect(onKeepAlive).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });
    advance(5_000);
    expect(onKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('no hace nada si está deshabilitado', () => {
    const { result, onTimeout } = setup({ enabled: false });
    advance(30 * MIN);
    expect(result.current.warning).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
