import { useCallback } from 'react';
import { useAuth } from '../../lib/auth';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, KEEPALIVE_MS } from '../../lib/env';
import { useSessionActivity } from '../../lib/useSessionActivity';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Cierre automático por inactividad (RNF-05c): avisa 1 minuto antes y cierra a los 15 minutos.
 * Mientras el usuario trabaja, avisa al servidor para que su sesión no expire antes.
 */
export function SessionGuard() {
  const { logout, keepAlive } = useAuth();

  const onTimeout = useCallback(() => {
    void logout('Su sesión se cerró por inactividad.');
  }, [logout]);

  const { warning, secondsLeft, stayActive } = useSessionActivity({
    enabled: true,
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    keepAliveMs: KEEPALIVE_MS,
    onTimeout,
    onKeepAlive: () => void keepAlive(),
  });

  return (
    <Modal open={warning} title="¿Sigue ahí?" onClose={stayActive} dismissible={false}>
      <p className="text-slate-600">
        Por seguridad, su sesión se cerrará por inactividad en <strong>{secondsLeft} s</strong>.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={() => void logout()}>
          Cerrar sesión
        </Button>
        <Button onClick={stayActive}>Seguir conectado</Button>
      </div>
    </Modal>
  );
}
