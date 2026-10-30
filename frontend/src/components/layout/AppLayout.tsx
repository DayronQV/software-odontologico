import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Brand, Sidebar, SidebarNav } from './Sidebar';
import { SessionGuard } from './SessionGuard';
import { Topbar } from './Topbar';

/**
 * Estructura de la aplicación: menú fijo en pantallas ≥ 1024 px (laptop, escritorio y tablet
 * horizontal), panel desplegable en tablet vertical y móvil.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onLogout={() => void logout()}
        />

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" data-testid="mobile-menu">
            <button
              type="button"
              aria-label="Cerrar menú"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
              <Brand />
              <SidebarNav role={user.role} onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <SessionGuard />
    </div>
  );
}
