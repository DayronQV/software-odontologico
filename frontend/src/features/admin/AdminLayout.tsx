import { Outlet } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabNav, type TabItem } from '../../components/ui/TabNav';

const TABS: TabItem[] = [
  { to: '/admin/users', label: 'Usuarios' },
  { to: '/admin/offices', label: 'Consultorios y sillones' },
  { to: '/admin/professionals', label: 'Profesionales' },
  { to: '/admin/procedures', label: 'Procedimientos' },
  { to: '/admin/insurers', label: 'Seguros y convenios' },
  { to: '/admin/alerts', label: 'Alertas médicas' },
  { to: '/admin/settings', label: 'Parámetros' },
];

export function AdminLayout() {
  return (
    <>
      <PageHeader title="Administración" description="Usuarios, catálogo médico y parámetros de la clínica." />
      <TabNav items={TABS} label="Secciones de administración" />
      <Outlet />
    </>
  );
}
