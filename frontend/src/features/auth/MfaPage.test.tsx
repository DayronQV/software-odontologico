import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { fakeAuth, renderWithProviders } from '../../test/utils';
import { MfaPage } from './MfaPage';

const renderMfa = (auth = fakeAuth()) =>
  renderWithProviders(
    <Routes>
      <Route path="/mfa" element={<MfaPage />} />
      <Route path="/login" element={<p>login</p>} />
      <Route path="/" element={<p>inicio</p>} />
    </Routes>,
    { auth, route: '/mfa' },
  );

describe('MfaPage', () => {
  it('sin sesión vuelve al login', () => {
    renderMfa(fakeAuth({ phase: 'anonymous' }));
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('primer ingreso: muestra el QR y activa el MFA con el código', async () => {
    const enableMfa = vi.fn().mockResolvedValue(undefined);
    renderMfa(fakeAuth({ phase: 'mfa_setup', enableMfa }));

    expect(await screen.findByAltText(/código QR/i)).toBeInTheDocument();
    expect(screen.getByText('ABC')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Activar y continuar' }));
    expect(await screen.findByText('El código tiene 6 dígitos')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Código de 6 dígitos'));
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Activar y continuar' }));
    await waitFor(() => expect(enableMfa).toHaveBeenCalledWith('123456'));
  });

  it('ingresos siguientes: verifica con el TOTP', async () => {
    const verifyMfa = vi.fn().mockResolvedValue(undefined);
    renderMfa(fakeAuth({ phase: 'mfa_verify', verifyMfa }));

    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(verifyMfa).toHaveBeenCalledWith({ code: '654321' }));
  });

  it('permite usar un código de recuperación y valida su formato', async () => {
    const verifyMfa = vi.fn().mockResolvedValue(undefined);
    renderMfa(fakeAuth({ phase: 'mfa_verify', verifyMfa }));

    await userEvent.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    await userEvent.type(screen.getByLabelText('Código de recuperación'), 'corto');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText(/Formato/)).toBeInTheDocument();
    expect(verifyMfa).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Código de recuperación'));
    await userEvent.type(screen.getByLabelText('Código de recuperación'), 'ABCDEF0123-4567890ABC');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() =>
      expect(verifyMfa).toHaveBeenCalledWith({ recoveryCode: 'ABCDEF0123-4567890ABC' }),
    );
  });

  it('muestra el error cuando el código es incorrecto', async () => {
    const verifyMfa = vi.fn().mockRejectedValue(new ApiError(401, 'Código MFA inválido'));
    renderMfa(fakeAuth({ phase: 'mfa_verify', verifyMfa }));

    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código MFA inválido');
  });

  it('tras el enrolamiento exige confirmar que se guardaron los códigos de recuperación', async () => {
    const acknowledgeRecovery = vi.fn();
    renderMfa(
      fakeAuth({
        phase: 'recovery_codes',
        recoveryCodes: ['AAAAAAAAAA-BBBBBBBBBB', 'CCCCCCCCCC-DDDDDDDDDD'],
        acknowledgeRecovery,
      }),
    );

    expect(screen.getByText('AAAAAAAAAA-BBBBBBBBBB')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/He guardado/));
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(acknowledgeRecovery).toHaveBeenCalled();
    expect(await screen.findByText('inicio')).toBeInTheDocument();
  });
});
