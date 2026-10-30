import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../lib/roles';
import { fakeAuth, renderWithProviders } from '../test/utils';
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

const links = () => screen.getAllByRole('link').map((a) => a.textContent);

describe('AppLayout: menú según el rol (menor privilegio)', () => {
  it('el administrador ve usuarios y auditoría', () => {
    renderLayout('ADMIN_TI');
    expect(links()).toEqual(expect.arrayContaining(['Inicio', 'Usuarios', 'Auditoría', 'Mi cuenta']));
  });

  it('el auditor ve auditoría pero no usuarios', () => {
    renderLayout('AUDITOR');
    expect(links()).toContain('Auditoría');
    expect(links()).not.toContain('Usuarios');
  });

  it('el odontólogo no ve administración ni auditoría', () => {
    renderLayout('ODONTOLOGO');
    expect(links()).not.toContain('Usuarios');
    expect(links()).not.toContain('Auditoría');
  });

  it('muestra el usuario y su perfil, y el menú desplegable en pantallas pequeñas', async () => {
    renderLayout('RECEPCIONISTA');
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Recepcionista / Cajero')).toBeInTheDocument();

    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();
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
