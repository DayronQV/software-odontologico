import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { CashierView } from './CashierView';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

const session = { id: 's1', status: 'OPEN', openedAt: '2026-11-02T13:00:00Z', openingFloat: 20, invoiceCount: 2 };

describe('CashierView: RN-02 cierre de caja ciego', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('sin caja abierta ofrece abrirla con el fondo inicial', async () => {
    apiMock.mockResolvedValueOnce({ session: null });
    renderWithProviders(<CashierView />);
    expect(await screen.findByText('Abrir caja', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Fondo inicial/)).toBeInTheDocument();
  });

  it('con caja abierta NO muestra ningún total del sistema antes del conteo', async () => {
    apiMock.mockResolvedValueOnce({ session });
    renderWithProviders(<CashierView />);
    expect(await screen.findByText('Mi caja')).toBeInTheDocument();

    expect(screen.getByText('Comprobantes')).toBeInTheDocument();
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diferencia/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no se muestran hasta que ingrese el conteo/i)).toBeInTheDocument();
  });

  it('exige el conteo y recién después muestra el esperado y la diferencia', async () => {
    apiMock.mockResolvedValueOnce({ session });
    renderWithProviders(<CashierView />);
    await screen.findByText('Mi caja');

    // sin contar no se envía nada
    await userEvent.click(screen.getByRole('button', { name: 'Contar y cerrar caja' }));
    expect(await screen.findByText('Ingrese el efectivo contado')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);

    apiMock.mockResolvedValueOnce({
      id: 's1', status: 'CLOSED', openedAt: session.openedAt, closedAt: '2026-11-02T22:00:00Z', openingFloat: 20, countedCash: 180, expectedCash: 182, difference: -2,
    });
    await userEvent.type(screen.getByLabelText('Efectivo contado'), '180');
    await userEvent.click(screen.getByRole('button', { name: 'Contar y cerrar caja' }));

    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith('/billing/cash-sessions/s1/close', { method: 'POST', body: { countedCash: 180, notes: undefined } }));
    expect(await screen.findByText('Caja cerrada')).toBeInTheDocument();
    expect(screen.getByText('Efectivo esperado por el sistema')).toBeInTheDocument();
    expect(screen.getByText(/Faltan .*2/)).toBeInTheDocument();
  });
});
