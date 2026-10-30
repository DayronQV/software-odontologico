import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-slate-600">La dirección no existe o fue movida.</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-brand-700 underline">
        Ir al inicio
      </Link>
    </div>
  );
}
