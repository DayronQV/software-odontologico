import { useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, KEEPALIVE_MS } from '../lib/env';
import { navFor, ROLE_LABELS } from '../lib/roles';
import { useSessionActivity } from '../lib/useSessionActivity';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

/**
 * Estructura de la aplicación: menú según el rol (fijo en laptop/escritorio, desplegable en
 * tablet/móvil), cabecera con el usuario y control de inactividad.
 */
export function AppLayout() {
  const { user, logout, keepAlive } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

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

  if (!user) return null;
  const items = navFor(user.role);

  const nav = (
    <nav aria-label="Principal" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
              isActive ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Menú fijo en pantallas ≥ 1024 px (laptop 1366×768, escritorio 1920×1080, tablet horizontal) */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="px-6 py-5 text-lg font-extrabold text-brand-700">🦷 SIGO-Dental</div>
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ☰
            </Button>
            <span className="font-extrabold text-brand-700 lg:hidden">SIGO-Dental</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <Button variant="secondary" onClick={() => void logout()}>
              Cerrar sesión
            </Button>
          </div>
        </header>

        {menuOpen && (
          <div className="border-b border-slate-200 bg-white lg:hidden" data-testid="mobile-menu">
            {nav}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <Modal open={warning} title="¿Sigue ahí?" onClose={stayActive} dismissible={false}>
        <p className="text-slate-700">
          Por seguridad, su sesión se cerrará por inactividad en{' '}
          <strong>{secondsLeft} s</strong>.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
          <Button onClick={stayActive}>Seguir conectado</Button>
        </div>
      </Modal>
    </div>
  );
}
