import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/roles';
import { ForbiddenPage } from '../features/misc/ForbiddenPage';

export function FullPageSpinner() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-slate-600">
      Cargando…
    </div>
  );
}

/** Exige sesión completa (MFA verificado) y, opcionalmente, uno de los roles indicados. */
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { phase, user } = useAuth();

  if (phase === 'loading') return <FullPageSpinner />;
  if (phase === 'anonymous') return <Navigate to="/login" replace />;
  if (phase !== 'authenticated') return <Navigate to="/mfa" replace />;
  if (roles && user && !roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
