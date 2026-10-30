import type { IconName } from '../components/ui/Icon';

export type Role = 'ADMIN_TI' | 'RECEPCIONISTA' | 'ODONTOLOGO' | 'ASISTENTE' | 'AUDITOR';

export const ALL_ROLES: Role[] = ['ADMIN_TI', 'RECEPCIONISTA', 'ODONTOLOGO', 'ASISTENTE', 'AUDITOR'];

/** Personal con acceso a datos de pacientes (el administrador de TI y el auditor NO). */
export const PATIENT_STAFF: Role[] = ['RECEPCIONISTA', 'ODONTOLOGO', 'ASISTENTE'];

/** Operación de caja y facturación. */
export const CASHIERS: Role[] = ['RECEPCIONISTA', 'ADMIN_TI'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_TI: 'Administrador TI',
  RECEPCIONISTA: 'Recepción y caja',
  ODONTOLOGO: 'Odontólogo',
  ASISTENTE: 'Asistente dental',
  AUDITOR: 'Auditor / Contador',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN_TI: 'Configuración global, usuarios, catálogos, auditoría y respaldos.',
  RECEPCIONISTA: 'Agendamiento, registro de pacientes, cobro y facturación.',
  ODONTOLOGO: 'Registro clínico, odontograma, plan de tratamiento, recetas y evolución.',
  ASISTENTE: 'Signos vitales, preparación de insumos y notas clínicas.',
  AUDITOR: 'Corte de caja, liquidación de honorarios e inventario.',
};

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: Role[];
  section: 'Principal' | 'Clínica' | 'Caja' | 'Sistema' | 'Cuenta';
}

/** Menú lateral: cada perfil solo ve lo que puede usar (menor privilegio también en la interfaz). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home', roles: ALL_ROLES, section: 'Principal' },
  { to: '/patients', label: 'Pacientes', icon: 'users', roles: PATIENT_STAFF, section: 'Clínica' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar', roles: PATIENT_STAFF, section: 'Clínica' },
  { to: '/waiting-room', label: 'Sala de espera', icon: 'clock', roles: PATIENT_STAFF, section: 'Clínica' },
  { to: '/billing/pos', label: 'Punto de venta', icon: 'receipt', roles: CASHIERS, section: 'Caja' },
  { to: '/billing/invoices', label: 'Comprobantes', icon: 'file', roles: [...CASHIERS, 'AUDITOR'], section: 'Caja' },
  { to: '/billing/cash', label: 'Caja', icon: 'wallet', roles: [...CASHIERS, 'AUDITOR'], section: 'Caja' },
  { to: '/admin', label: 'Administración', icon: 'settings', roles: ['ADMIN_TI'], section: 'Sistema' },
  { to: '/audit', label: 'Auditoría', icon: 'shield', roles: ['ADMIN_TI', 'AUDITOR'], section: 'Sistema' },
  { to: '/account/password', label: 'Mi cuenta', icon: 'user', roles: ALL_ROLES, section: 'Cuenta' },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Agrupa el menú por sección conservando el orden. */
export function navSections(role: Role): Array<{ section: NavItem['section']; items: NavItem[] }> {
  const groups: Array<{ section: NavItem['section']; items: NavItem[] }> = [];
  for (const item of navFor(role)) {
    const last = groups[groups.length - 1];
    if (last?.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
