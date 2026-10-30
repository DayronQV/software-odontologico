import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api';
import { renderWithProviders } from '../../../test/utils';
import { PrescriptionForm } from './PrescriptionForm';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

const medications = [
  { id: 'm-amox', name: 'Amoxicilina 500 mg cápsulas', activeIngredient: 'Amoxicilina', presentation: 'Cápsulas' },
  { id: 'm-ibu', name: 'Ibuprofeno 400 mg', activeIngredient: 'Ibuprofeno', presentation: 'Tabletas' },
];
const conflict = { drug: 'Amoxicilina 500 mg cápsulas', allergy: 'Penicilina' };

function setup() {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(<PrescriptionForm patientId="p1" medications={medications} onSaved={onSaved} onCancel={vi.fn()} />);
  return { onSaved };
}

async function fillItem() {
  await userEvent.type(screen.getByLabelText('Dosis'), '1 cápsula');
  await userEvent.type(screen.getByLabelText('Frecuencia'), 'Cada 8 horas');
  await userEvent.type(screen.getByLabelText('Duración'), '7 días');
}

describe('<PrescriptionForm>: alerta de alergias', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('un fármaco sin conflicto no muestra alerta y se puede emitir', async () => {
    apiMock.mockResolvedValue({ conflicts: [] });
    const { onSaved } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Del catálogo'), 'm-ibu');
    await fillItem();
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/patients/p1/prescriptions/check', expect.anything()));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = apiMock.mock.calls.find(([path]) => path === '/patients/p1/prescriptions')?.[1].body;
    expect(body.items[0]).toMatchObject({ medicationId: 'm-ibu', name: 'Ibuprofeno 400 mg', dose: '1 cápsula' });
    expect(body.allergyOverrideReason).toBeUndefined();
  });

  it('un fármaco al que el paciente es alérgico dispara la alerta y bloquea la emisión', async () => {
    apiMock.mockResolvedValue({ conflicts: [conflict] });
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Del catálogo'), 'm-amox');
    await fillItem();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Alerta de alergia');
    expect(alert).toHaveTextContent('Amoxicilina 500 mg cápsulas');
    expect(alert).toHaveTextContent('Penicilina');
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
  });

  it('solo se emite con una justificación del profesional, que viaja en la receta', async () => {
    apiMock.mockImplementation(async (path: string) => (path.endsWith('/check') ? { conflicts: [conflict] } : {}));
    const { onSaved } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Del catálogo'), 'm-amox');
    await fillItem();
    await screen.findByRole('alert');

    const emit = screen.getByRole('button', { name: 'Emitir receta' });
    await userEvent.type(screen.getByLabelText(/Justificación/), 'corta');
    expect(emit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Justificación/), ' pero suficiente: reacción leve previa');
    expect(emit).toBeEnabled();
    await userEvent.click(emit);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = apiMock.mock.calls.find(([path]) => path === '/patients/p1/prescriptions')?.[1].body;
    expect(body.allergyOverrideReason).toContain('reacción leve previa');
  });

  it('si el servidor rechaza por alergia (409) muestra el detalle de la alerta', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/check')) return { conflicts: [] }; // la verificación en vivo no la detectó
      throw new ApiError(409, 'Alerta: el paciente es alérgico a un fármaco de la receta', { conflicts: [conflict] });
    });
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Del catálogo'), 'm-amox');
    await fillItem();
    await userEvent.click(screen.getByRole('button', { name: 'Emitir receta' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => a.textContent?.includes('Penicilina'))).toBe(true);
  });

  it('exige completar dosis, frecuencia y duración, y permite varios medicamentos', async () => {
    apiMock.mockResolvedValue({ conflicts: [] });
    setup();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar otro medicamento' }));
    expect(screen.getAllByText(/^Medicamento \d$/)).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar medicamento' })[1]);
    expect(screen.getAllByText(/^Medicamento \d$/)).toHaveLength(1);
  });
});
