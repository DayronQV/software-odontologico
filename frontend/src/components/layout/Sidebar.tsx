import { NavLink } from 'react-router-dom';
import { navSections, type Role } from '../../lib/roles';
import { Icon } from '../ui/Icon';

export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <Icon name="tooth" className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="text-base font-semibold text-slate-900">SIGO-Dental</p>
        <p className="text-xs text-slate-500">Gestión odontológica</p>
      </div>
    </div>
  );
}

/** Menú agrupado por secciones; se usa fijo (pantallas grandes) y dentro del panel desplegable. */
export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {navSections(role).map(({ section, items }) => (
        <div key={section}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {section}
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                      isActive
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
      <Brand />
      <SidebarNav role={role} />
    </aside>
  );
}
