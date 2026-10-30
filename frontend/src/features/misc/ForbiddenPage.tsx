import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Acceso denegado</h1>
      <p className="mt-2 text-slate-600">Su perfil no tiene permisos para ver esta sección.</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-brand-700 underline">
        Volver al inicio
      </Link>
    </div>
  );
}
