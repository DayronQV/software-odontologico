import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../lib/auth';
import { IDLE_TIMEOUT_MS } from '../../lib/env';
import { formatLongDate } from '../../lib/format';
import { navFor, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles';

const SHORTCUT_TEXT: Record<string, string> = {
  '/patients': 'Fichas, anamnesis y alertas médicas',
  '/agenda': 'Citas por sillón y profesional',
  '/waiting-room': 'Pacientes que esperan, en tiempo real',
  '/billing/pos': 'Cobro con pagos mixtos y comprobante',
  '/billing/invoices': 'Comprobantes emitidos y anulaciones',
  '/billing/cash': 'Apertura y cierre ciego de caja',
  '/inventory': 'Insumos por consultorio y profesional, kardex y alertas',
  '/commissions': 'Reglas, comisiones y liquidación de honorarios',
  '/reports': 'Panel de indicadores y reportes exportables',
  '/admin': 'Usuarios, catálogo y parámetros',
  '/audit': 'Registro inmutable de accesos y cambios',
  '/account/password': 'Datos de su cuenta y contraseña',
};

export function HomePage() {
  const { user } = useAuth();
  if (!user) return null;
  const shortcuts = navFor(user.role).filter((item) => item.to !== '/');
  const firstName = user.fullName.split(' ')[0];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white p-6 sm:p-8">
        <p className="text-sm capitalize text-brand-700">{formatLongDate(new Date())}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Hola, {firstName}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{ROLE_DESCRIPTIONS[user.role]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
          <Badge tone="success">Verificación en dos pasos activa</Badge>
          <Badge tone="neutral">Cierre por inactividad: {IDLE_TIMEOUT_MS / 60_000} min</Badge>
        </div>
      </section>

      <section aria-labelledby="accesos" className="space-y-3">
        <h2 id="accesos" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Accesos</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => (
            <Link key={item.to} to={item.to} className="group">
              <Card className="h-full transition group-hover:border-brand-200 group-hover:shadow-md">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{SHORTCUT_TEXT[item.to]}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
