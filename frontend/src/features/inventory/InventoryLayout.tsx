import { Outlet } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabNav } from '../../components/ui/TabNav';

const TABS = [
  { to: '/inventory', label: 'Existencias' },
  { to: '/inventory/items', label: 'Insumos' },
  { to: '/inventory/movements', label: 'Kardex' },
  { to: '/inventory/recipes', label: 'Recetas de consumo' },
  { to: '/inventory/supply', label: 'Preparación' },
  { to: '/inventory/counts', label: 'Inventario físico' },
];

export function InventoryLayout() {
  return (
    <>
      <PageHeader title="Inventario" description="Insumos por consultorio y por profesional, con kardex inmutable y descargo automático." />
      <TabNav items={TABS} label="Secciones de inventario" />
      <Outlet />
    </>
  );
}
