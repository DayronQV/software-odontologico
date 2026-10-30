import { initials } from '../../lib/format';
import { ROLE_LABELS, type Role } from '../../lib/roles';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

interface TopbarProps {
  user: { fullName: string; role: Role };
  menuOpen: boolean;
  onToggleMenu: () => void;
  onLogout: () => void;
}

export function Topbar({ user, menuOpen, onToggleMenu, onLogout }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>
        <span className="font-semibold text-slate-900 lg:hidden">SIGO-Dental</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
            {initials(user.fullName)}
          </span>
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onLogout} aria-label="Cerrar sesión">
          <Icon name="logout" className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </div>
    </header>
  );
}
