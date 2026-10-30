import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabNav } from '../../components/ui/TabNav';
import { useAuth } from '../../lib/auth';

const FINANCE_TABS = [
  { to: '/commissions', label: 'Liquidaciones' },
  { to: '/commissions/rules', label: 'Reglas' },
  { to: '/commissions/simulator', label: 'Simulador' },
];
const DENTIST_TABS = [{ to: '/commissions', label: 'Mis comisiones' }];

export function CommissionsLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const dentist = user?.role === 'ODONTOLOGO';
  // El odontólogo solo tiene su vista: cualquier otra ruta lo devuelve a ella
  if (dentist && pathname !== '/commissions') return <Navigate to="/commissions" replace />;
  return (
    <>
      <PageHeader
        title="Comisiones"
        description={dentist ? 'Sus comisiones devengadas y liquidaciones (solo lectura).' : 'Reglas de comisión, devengo al cobrar y liquidación de honorarios por período.'}
      />
      <TabNav items={dentist ? DENTIST_TABS : FINANCE_TABS} label="Secciones de comisiones" />
      <Outlet />
    </>
  );
}
