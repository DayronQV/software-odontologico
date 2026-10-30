import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api';
import { renderWithProviders } from '../../../test/utils';
import { SigningDialog } from './SigningDialog';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

// jsdom no implementa <canvas>: se simula lo mínimo para que el lienzo de firma registre un trazo
beforeEach(() => {
  apiMock.mockReset();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), setTransform: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,FIRMA');
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function setup() {
  const onSigned = vi.fn();
  renderWithProviders(
    <SigningDialog open title="Consentimiento informado" signingId="s1" document={<p>Autorizo el procedimiento.</p>} defaultSignerName="Carlos Mendoza" onClose={vi.fn()} onSigned={onSigned} />,
  );
  return { onSigned };
}

function draw() {
  const canvas = screen.getByRole('img', { name: /Área de firma/ });
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 30, pressure: 0.6 });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' });
}

describe('<SigningDialog>: firma táctil (RF-06)', () => {
  it('muestra el documento y no deja firmar sin trazo', () => {
    setup();
    expect(screen.getByText('Autorizo el procedimiento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Firmar documento' })).toBeDisabled();
  });

  it('firma con el trazo y envía los metadatos del dispositivo', async () => {
    apiMock.mockResolvedValue({});
    const { onSigned } = setup();
    draw();
    const sign = screen.getByRole('button', { name: 'Firmar documento' });
    await waitFor(() => expect(sign).toBeEnabled());
    await userEvent.click(sign);

    await waitFor(() => expect(onSigned).toHaveBeenCalled());
    const [path, options] = apiMock.mock.calls[0];
    expect(path).toBe('/signing/s1/touch');
    expect(options.body).toMatchObject({ signerName: 'Carlos Mendoza', image: 'data:image/png;base64,FIRMA', strokes: 1, pointerType: expect.any(String) });
  });

  it('«Borrar firma» limpia el lienzo y vuelve a bloquear', async () => {
    setup();
    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Borrar firma' }));
    expect(screen.getByRole('button', { name: 'Firmar documento' })).toBeDisabled();
  });

  it('muestra el error del servidor sin cerrar el diálogo', async () => {
    apiMock.mockRejectedValue(new ApiError(409, 'Este documento ya fue firmado'));
    const { onSigned } = setup();
    draw();
    await userEvent.click(await screen.findByRole('button', { name: 'Firmar documento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya fue firmado');
    expect(onSigned).not.toHaveBeenCalled();
  });
});

describe('<SigningDialog>: código OTP (RF-06)', () => {
  const otp = { sentTo: '••••4567', expiresAt: '2026-11-02T15:10:00Z', attemptsLeft: 3 };

  async function openOtp() {
    await userEvent.click(screen.getByRole('tab', { name: 'Código por mensaje' }));
  }

  it('envía el código y permite verificarlo', async () => {
    apiMock.mockImplementation(async (path: string) => (path.endsWith('/otp') ? { otp, suggestedSignerName: 'Carlos Mendoza' } : {}));
    const { onSigned } = setup();
    await openOtp();
    expect(screen.queryByLabelText('Código de 6 dígitos')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('status')).toHaveTextContent('••••4567');
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '12ab3456');
    expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('123456'); // solo dígitos, máximo 6
    await userEvent.click(screen.getByRole('button', { name: 'Verificar y firmar' }));

    await waitFor(() => expect(onSigned).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith('/signing/s1/otp/verify', { method: 'POST', body: { code: '123456', signerName: 'Carlos Mendoza' } });
  });

  it('con un código incorrecto avisa y muestra los intentos que quedan', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/signing/s1/otp') return { otp };
      if (path === '/signing/s1/otp/verify') throw new ApiError(400, 'Código incorrecto. Intentos restantes: 2');
      return { otp: { ...otp, attemptsLeft: 2 } };
    });
    const { onSigned } = setup();
    await openOtp();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código de 6 dígitos'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Intentos restantes: 2');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Intentos restantes: 2'));
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('el botón de verificar exige los 6 dígitos', async () => {
    apiMock.mockResolvedValue({ otp });
    setup();
    await openOtp();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código de 6 dígitos'), '123');
    expect(screen.getByRole('button', { name: 'Verificar y firmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeInTheDocument();
  });
});
