import { NavLink } from 'react-router-dom';

export interface TabItem {
  to: string;
  label: string;
}

/** Pestañas de navegación (cada una es una ruta), con desplazamiento horizontal en pantallas estrechas. */
export function TabNav({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-6 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                `-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm font-medium transition ${
                  isActive
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
