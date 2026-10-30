export type Role = 'ADMIN_TI' | 'RECEPCIONISTA' | 'ODONTOLOGO' | 'ASISTENTE' | 'AUDITOR';

export const ALL_ROLES: Role[] = ['ADMIN_TI', 'RECEPCIONISTA', 'ODONTOLOGO', 'ASISTENTE', 'AUDITOR'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_TI: 'Administrador TI / Sistema',
  RECEPCIONISTA: 'Recepcionista / Cajero',
  ODONTOLOGO: 'Odontólogo',
  ASISTENTE: 'Asistente Dental',
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
  roles: Role[];
}

/** Menú lateral: cada rol solo ve lo que puede usar (menor privilegio también en la interfaz). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', roles: ALL_ROLES },
  { to: '/users', label: 'Usuarios', roles: ['ADMIN_TI'] },
  { to: '/audit', label: 'Auditoría', roles: ['ADMIN_TI', 'AUDITOR'] },
  { to: '/account/password', label: 'Mi cuenta', roles: ALL_ROLES },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
