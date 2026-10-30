import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../lib/auth';
import { fakeAuth, renderWithProviders } from '../test/utils';
import { ProtectedRoute } from './ProtectedRoute';

const user = (role: SessionUser['role']): SessionUser => ({
  id: '1',
  email: 'a@b.c',
  fullName: 'Ana',
  role,
});

function renderRoute(auth = fakeAuth(), roles?: SessionUser['role'][]) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>pantalla login</p>} />
      <Route path="/mfa" element={<p>pantalla mfa</p>} />
      <Route
        path="/"
        element={
          <ProtectedRoute roles={roles}>
            <p>contenido protegido</p>
          </ProtectedRoute>
        }
      />
    </Routes>,
    { auth },
  );
}

describe('ProtectedRoute', () => {
  it('muestra un indicador mientras se restaura la sesión', () => {
    renderRoute(fakeAuth({ phase: 'loading' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
  });

  it('sin sesión redirige al login', () => {
    renderRoute(fakeAuth({ phase: 'anonymous' }));
    expect(screen.getByText('pantalla login')).toBeInTheDocument();
  });

  it.each(['mfa_setup', 'mfa_verify', 'recovery_codes'] as const)(
    'con el MFA pendiente (%s) redirige a la pantalla de MFA',
    (phase) => {
      renderRoute(fakeAuth({ phase, user: user('ADMIN_TI') }));
      expect(screen.getByText('pantalla mfa')).toBeInTheDocument();
      expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
    },
  );

  it('con sesión completa muestra el contenido', () => {
    renderRoute(fakeAuth({ phase: 'authenticated', user: user('ODONTOLOGO') }));
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('respeta los roles permitidos', () => {
    renderRoute(fakeAuth({ phase: 'authenticated', user: user('ODONTOLOGO') }), ['ADMIN_TI']);
    expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('permite el acceso al rol autorizado', () => {
    renderRoute(fakeAuth({ phase: 'authenticated', user: user('AUDITOR') }), ['ADMIN_TI', 'AUDITOR']);
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });
});
