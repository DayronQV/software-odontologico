import { Link } from 'react-router-dom';
import { AlertBadge } from '../../components/ui/AlertBadge';
import { useAuth } from '../../lib/auth';
import { navFor, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles';

export function HomePage() {
  const { user } = useAuth();
  if (!user) return null;
  const shortcuts = navFor(user.role).filter((item) => item.to !== '/');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Bienvenido, {user.fullName}</h1>
        <p className="mt-1 text-sm font-semibold text-brand-700">{ROLE_LABELS[user.role]}</p>
        <p className="mt-2 text-slate-600">{ROLE_DESCRIPTIONS[user.role]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AlertBadge level="success">Verificación en dos pasos activa</AlertBadge>
          <AlertBadge level="info">Cierre automático tras 15 min de inactividad</AlertBadge>
        </div>
      </section>

      <section aria-labelledby="accesos" className="space-y-3">
        <h2 id="accesos" className="text-lg font-bold text-slate-900">
          Accesos disponibles
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-h-20 items-center rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-800 hover:border-brand-600 hover:bg-brand-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          Los módulos de pacientes, agenda, odontograma y facturación se habilitarán en las
          siguientes fases del proyecto.
        </p>
      </section>
    </div>
  );
}
