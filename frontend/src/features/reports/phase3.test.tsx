import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import { AuthContext } from '../../lib/auth';
import type { Role } from '../../lib/roles';
import { fakeAuth, renderWithProviders } from '../../test/utils';
import { CommissionsLayout } from '../commissions/CommissionsLayout';
import { MovementModal } from '../inventory/MovementModal';
import { DashboardPanel } from './DashboardPanel';
import { formatCell, type Dashboard } from './types';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: apiMock }));

describe('formato de reportes', () => {
  it('da formato a dinero, porcentajes, fechas y vacíos', () => {
    expect(formatCell(1234.5, 'money', 'USD')).toMatch(/1234,50|1.234,50/);
    expect(formatCell(12.5, 'percent', 'USD')).toBe('12.5 %');
    expect(formatCell(7, 'number', 'USD')).toBe('7');
    expect(formatCell(null, 'text', 'USD')).toBe('—');
    expect(formatCell('2026-11-02T15:00:00Z', 'date', 'USD')).not.toContain('T15');
  });
});

describe('<DashboardPanel>', () => {
  const data: Dashboard = {
    period: { from: '2026-10-01', to: '2026-10-31' },
    currency: 'USD',
    cached: true,
    kpis: { revenue: 1500, invoices: 12, appointments: 40, noShowRate: 20, occupancy: 55, budgetConversion: 60, lowStock: 2, expiring: 1, pendingCommissions: 300 },
    revenueByDay: [{ label: '2026-10-30', value: 500 }],
    revenueByProfessional: [{ label: 'Dr. Salazar', value: 1500 }],
    paymentMethods: [{ method: 'CASH', amount: 900 }],
  };

  it('muestra los KPIs, las barras y avisa cuando vienen de la caché', () => {
    render(<DashboardPanel data={data} />);
    expect(screen.getByText('Tasa de No-Show').closest('div')).toHaveTextContent('20 %');
    expect(screen.getByText('Insumos bajo mínimo').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('Dr. Salazar')).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText(/caché/)).toBeInTheDocument();
  });
});

describe('<MovementModal>', () => {
  beforeEach(() => apiMock.mockReset());
  const props = {
    items: [{ id: 'i1', code: 'RES', name: 'Resina', unit: 'g', unitCost: 1, minStock: 0, active: true }],
    locations: [{ id: 'l1', name: 'Consultorio A', officeId: 'o1', professionalId: null }],
    onClose: vi.fn(),
    onSaved: vi.fn(),
  };

  it('un ajuste exige el motivo (mínimo 5 caracteres) antes de registrarse', async () => {
    apiMock.mockResolvedValue({});
    renderWithProviders(<MovementModal mode="adjust" {...props} />);
    await userEvent.selectOptions(screen.getByLabelText('Insumo'), 'i1');
    await userEvent.selectOptions(screen.getByLabelText('Ubicación'), 'l1');
    await userEvent.type(screen.getByLabelText('Cantidad (negativa resta)'), '-2');
    const submit = screen.getByRole('button', { name: 'Registrar' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motivo (obligatorio)'), 'Se cayó el frasco');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/inventory/adjustments', { method: 'POST', body: { itemId: 'i1', locationId: 'l1', quantity: -2, reason: 'Se cayó el frasco' } }));
  });

  it('una entrada pide proveedor, lote y vencimiento', () => {
    renderWithProviders(<MovementModal mode="entry" {...props} />);
    for (const label of ['Proveedor', 'Lote', 'Vencimiento']) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});

describe('<CommissionsLayout>: cada perfil ve lo suyo', () => {
  const renderAs = (role: Role, route: string) => {
    const auth = fakeAuth({ phase: 'authenticated', user: { id: 'u', email: 'x@sigo.test', fullName: 'X', role } });
    render(
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <Routes>
              <Route path="/commissions" element={<CommissionsLayout />}>
                <Route index element={<p>vista</p>} />
                <Route path="rules" element={<p>reglas</p>} />
              </Route>
            </Routes>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );
  };

  it('contabilidad ve liquidaciones, reglas y simulador', () => {
    renderAs('AUDITOR', '/commissions');
    for (const tab of ['Liquidaciones', 'Reglas', 'Simulador']) expect(screen.getByRole('link', { name: tab })).toBeInTheDocument();
  });

  it('el odontólogo solo ve «Mis comisiones» y no puede entrar a las reglas', () => {
    renderAs('ODONTOLOGO', '/commissions/rules');
    expect(screen.getByRole('link', { name: 'Mis comisiones' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reglas' })).not.toBeInTheDocument();
    expect(screen.queryByText('reglas')).not.toBeInTheDocument();
    expect(screen.getByText('vista')).toBeInTheDocument();
  });
});
