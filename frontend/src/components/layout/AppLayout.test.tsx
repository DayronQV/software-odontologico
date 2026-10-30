import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../../lib/roles';
import { fakeAuth, renderWithProviders } from '../../test/utils';
import { AppLayout } from './AppLayout';

function renderLayout(role: Role, overrides = {}) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<p>contenido</p>} />
      </Route>
    </Routes>,
    {
      auth: fakeAuth({
        phase: 'authenticated',
        user: { id: '1', email: 'a@b.c', fullName: 'Ana Pérez', role },
        ...overrides,
      }),
    },
  );
}

const sidebarLinks = () =>
  within(screen.getAllByRole('navigation', { name: 'Principal' })[0])
    .getAllByRole('link')
    .map((a) => a.textContent?.trim());

describe('AppLayout: menú según el perfil (menor privilegio)', () => {
  it('el administrador ve Administración y Auditoría, pero no datos de pacientes', () => {
    renderLayout('ADMIN_TI');
    const links = sidebarLinks();
    expect(links).toEqual(expect.arrayContaining(['Inicio', 'Administración', 'Auditoría', 'Punto de venta', 'Mi cuenta']));
    expect(links).not.toContain('Pacientes');
    expect(links).not.toContain('Agenda');
  });

  it('recepción ve pacientes, agenda, sala de espera y caja; no administración', () => {
    renderLayout('RECEPCIONISTA');
    const links = sidebarLinks();
    expect(links).toEqual(expect.arrayContaining(['Pacientes', 'Agenda', 'Sala de espera', 'Punto de venta', 'Comprobantes', 'Caja']));
    expect(links).not.toContain('Administración');
    expect(links).not.toContain('Auditoría');
  });

  it('el odontólogo ve el área clínica, sin caja ni administración', () => {
    renderLayout('ODONTOLOGO');
    const links = sidebarLinks();
    expect(links).toEqual(expect.arrayContaining(['Pacientes', 'Agenda', 'Sala de espera']));
    for (const hidden of ['Punto de venta', 'Caja', 'Administración', 'Auditoría']) expect(links).not.toContain(hidden);
  });

  it('el auditor ve comprobantes, caja y auditoría; nada clínico', () => {
    renderLayout('AUDITOR');
    const links = sidebarLinks();
    expect(links).toEqual(expect.arrayContaining(['Comprobantes', 'Caja', 'Auditoría']));
    expect(links).not.toContain('Pacientes');
    expect(links).not.toContain('Punto de venta');
  });

  it('muestra el usuario y su perfil, y un menú desplegable en pantallas pequeñas', async () => {
    renderLayout('RECEPCIONISTA');
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Recepción y caja')).toBeInTheDocument();

    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
  });

  it('cerrar sesión llama a logout', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderLayout('ADMIN_TI', { logout });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });
});

describe('AppLayout: inactividad (RNF-05c)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avisa a los 14 min y cierra la sesión a los 15 min', () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderLayout('ODONTOLOGO', { logout });

    act(() => vi.advanceTimersByTime(14 * 60_000 + 5_000));
    expect(screen.getByRole('dialog', { name: '¿Sigue ahí?' })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60_000));
    expect(logout).toHaveBeenCalledWith('Su sesión se cerró por inactividad.');
  });

  it('"Seguir conectado" evita el cierre y avisa al servidor', () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const keepAlive = vi.fn().mockResolvedValue(undefined);
    renderLayout('ODONTOLOGO', { logout, keepAlive });

    act(() => vi.advanceTimersByTime(14 * 60_000 + 5_000));
    act(() => screen.getByRole('button', { name: 'Seguir conectado' }).click());

    expect(keepAlive).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(logout).not.toHaveBeenCalled();
  });
});
