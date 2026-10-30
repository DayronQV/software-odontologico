import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { BudgetSection } from './BudgetSection';
import type { Budget } from './types';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: apiMock }));

const line = (itemId: string, description: string, fee: number, labCost: number, itemStatus: Budget['phases'][0]['lines'][0]['itemStatus']) => ({
  itemId, description, toothCode: 46, fee, labCost, itemStatus, sessionNumber: 1,
});

const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  planId: 'plan1',
  planTitle: 'Rehabilitación',
  version: 2,
  status: 'OPEN',
  createdAt: '2026-11-02T10:00:00Z',
  createdBy: 'Dr. Salazar',
  subtotalFees: 460,
  subtotalLab: 20,
  discountPercent: 10,
  discountAmount: 46,
  total: 434,
  discountAuthorization: null,
  phases: [
    { name: 'Fase 1', position: 1, fees: 300, lab: 20, discount: 30, total: 290, lines: [line('i1', 'Endodoncia — diente 46', 200, 20, 'PENDING'), line('i2', 'Resina — diente 16', 100, 0, 'PENDING')] },
    { name: 'Fase 2', position: 2, fees: 160, lab: 0, discount: 16, total: 144, lines: [line('i3', 'Corona — diente 46', 160, 0, 'APPROVED')] },
  ],
  approvals: [],
  ...overrides,
});

function setup(b: Budget, canEdit = true) {
  apiMock.mockImplementation(async (path: string) => {
    if (path === '/treatment-plans/plan1/budgets') return [b];
    if (path === '/budgets/b1/approvals') return { id: 'ap1', budgetId: 'b1', itemIds: ['i1'], approvedTotal: 220, signing: { id: 's1', status: 'PENDING' } };
    return {};
  });
  renderWithProviders(<BudgetSection planId="plan1" patientName="Carlos Mendoza" isMinor={false} canEdit={canEdit} onChanged={vi.fn().mockResolvedValue(undefined)} />);
}

describe('<BudgetSection>: presupuesto y aprobación parcial (RF-07, RF-08)', () => {
  beforeEach(() => apiMock.mockReset());

  it('muestra honorarios, laboratorio, descuento y total, y los totales por fase', async () => {
    setup(budget());
    expect(await screen.findByText('Versión 2')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    const fase1 = screen.getByRole('region', { name: 'Fase 1' });
    expect(within(fase1).getByText(/Total de la fase/)).toHaveTextContent('290');
    expect(screen.getByText(/Descuento \(10 %\)/)).toBeInTheDocument();
    expect(screen.getByText('Total').closest('div')).toHaveTextContent('434');
  });

  it('un descuento sobre el umbral avisa que el administrador debe autorizarlo y no deja aprobar', async () => {
    setup(budget({ status: 'PENDING_AUTHORIZATION', discountPercent: 25 }));
    expect(await screen.findByText(/El administrador debe autorizarlo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobación total/ })).not.toBeInTheDocument();
  });

  it('solo se pueden marcar los ítems pendientes; los ya aprobados no', async () => {
    setup(budget());
    await screen.findByText('Versión 2');
    expect(screen.getByLabelText('Aprobar Endodoncia — diente 46')).toBeInTheDocument();
    expect(screen.getByLabelText('Aprobar Resina — diente 16')).toBeInTheDocument();
    expect(screen.queryByLabelText('Aprobar Corona — diente 46')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar seleccionados (0)' })).toBeDisabled();
  });

  it('la aprobación parcial envía solo los ítems elegidos', async () => {
    setup(budget());
    await screen.findByText('Versión 2');
    await userEvent.click(screen.getByLabelText('Aprobar Endodoncia — diente 46'));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionados (1)' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/budgets/b1/approvals', { method: 'POST', body: { itemIds: ['i1'] } }));
    // se abre la firma del paciente
    expect(await screen.findByText('Aprobación del presupuesto v2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Firmar documento' })).toBeDisabled();
  });

  it('la aprobación total no envía lista de ítems (el servidor toma todos los pendientes)', async () => {
    setup(budget());
    await screen.findByText('Versión 2');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobación total (2)' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/budgets/b1/approvals', { method: 'POST', body: { itemIds: undefined } }));
  });

  it('sin permiso de edición no ofrece aprobar ni generar presupuestos', async () => {
    setup(budget(), false);
    await screen.findByText('Versión 2');
    expect(screen.queryByRole('button', { name: /Aprobación total/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar presupuesto' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Aprobar /)).not.toBeInTheDocument();
  });

  it('lista las aprobaciones firmadas y las pendientes de firma', async () => {
    setup(
      budget({
        approvals: [
          { id: 'a1', itemIds: ['i3'], approvedTotal: 144, createdAt: '2026-11-02T11:00:00Z', hasPdf: true, signing: { status: 'SIGNED', method: 'TOUCH', signerName: 'Carlos Mendoza', signedAt: '2026-11-02T11:05:00Z' } },
          { id: 'a2', itemIds: ['i1'], approvedTotal: 220, createdAt: '2026-11-02T12:00:00Z', hasPdf: false, signing: { status: 'PENDING', method: null, signerName: null, signedAt: null } },
        ],
      }),
    );
    expect(await screen.findByText('Firmada')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de firma')).toBeInTheDocument();
    expect(screen.getByText(/firmó Carlos Mendoza/)).toBeInTheDocument();
  });

  it('genera una versión nueva con el descuento indicado', async () => {
    setup(budget());
    await screen.findByText('Versión 2');
    const discount = screen.getByLabelText('Descuento (%)');
    await userEvent.clear(discount);
    await userEvent.type(discount, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Generar presupuesto' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/treatment-plans/plan1/budgets', { method: 'POST', body: { discountPercent: 15 } }));
  });
});
