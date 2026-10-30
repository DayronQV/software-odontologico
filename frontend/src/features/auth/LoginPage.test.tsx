import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { fakeAuth, renderWithProviders } from '../../test/utils';
import { LoginPage } from './LoginPage';

function renderLogin(auth = fakeAuth()) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<p>inicio</p>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<p>pantalla mfa</p>} />
    </Routes>,
    { auth, route: '/login' },
  );
}

describe('LoginPage', () => {
  it('valida los campos antes de enviar', async () => {
    const login = vi.fn();
    renderLogin(fakeAuth({ login }));

    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Ingrese su correo')).toBeInTheDocument();
    expect(screen.getByText('Ingrese su contraseña')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('envía las credenciales y pasa a la verificación MFA', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin(fakeAuth({ login }));

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'odontologo@sigo.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Sigo-Dev-2026!');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('odontologo@sigo.test', 'Sigo-Dev-2026!'));
    expect(await screen.findByText('pantalla mfa')).toBeInTheDocument();
  });

  it('muestra el error del servidor sin revelar detalles', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'Credenciales inválidas'));
    renderLogin(fakeAuth({ login }));

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('explica el bloqueo por demasiados intentos (429)', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(429, 'ThrottlerException: Too Many Requests'));
    renderLogin(fakeAuth({ login }));

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });

  it('muestra el aviso de sesión expirada', () => {
    renderLogin(fakeAuth({ notice: 'Su sesión se cerró por inactividad.' }));
    expect(screen.getByRole('status')).toHaveTextContent('inactividad');
  });

  it('si ya hay sesión completa, redirige al inicio', () => {
    renderLogin(fakeAuth({ phase: 'authenticated' }));
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });
});
