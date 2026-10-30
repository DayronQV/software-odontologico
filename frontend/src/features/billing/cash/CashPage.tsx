import { PageHeader } from '../../../components/ui/PageHeader';
import { useAuth } from '../../../lib/auth';
import { CASHIERS } from '../../../lib/roles';
import { CashReportsView } from './CashReportsView';
import { CashierView } from './CashierView';

/**
 * Caja. Recepción opera con cierre ciego (RN-02); el administrador además ve los cortes con
 * totales, y el auditor/contador solo los cortes.
 */
export function CashPage() {
  const { user } = useAuth();
  const isCashier = !!user && CASHIERS.includes(user.role);
  const canSeeReports = user?.role === 'ADMIN_TI' || user?.role === 'AUDITOR';

  return (
    <>
      <PageHeader
        title="Caja"
        description={isCashier ? 'Apertura y cierre ciego de su caja.' : 'Cortes de caja de la clínica.'}
      />
      <div className="space-y-8">
        {isCashier && <CashierView />}
        {canSeeReports && <CashReportsView />}
      </div>
    </>
  );
}
