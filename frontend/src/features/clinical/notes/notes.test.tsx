import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { NoteCard } from './NoteCard';
import { NoteForm } from './NoteForm';
import { lockCountdown, type EvolutionNote } from './notes-types';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

const HOUR = 3_600_000;
const note = (overrides: Partial<EvolutionNote> = {}): EvolutionNote => ({
  id: 'n1',
  patientId: 'p1',
  appointmentId: null,
  kind: 'SOEP',
  author: 'Dr. Salazar',
  authorId: 'u1',
  subjective: 'Dolor al masticar',
  objective: 'Caries profunda en 46',
  assessment: 'Pulpitis irreversible',
  plan: 'Endodoncia',
  createdAt: new Date(Date.now() - HOUR).toISOString(),
  lockAt: new Date(Date.now() + 23 * HOUR).toISOString(),
  locked: false,
  signed: false,
  signedAt: null,
  signedBy: null,
  contentHash: null,
  addenda: [],
  ...overrides,
});

describe('plazo de edición de las notas (RF-05)', () => {
  const now = new Date('2026-11-02T10:00:00Z').getTime();
  it('cuenta atrás hasta el bloqueo y luego dice «Bloqueada»', () => {
    expect(lockCountdown('2026-11-03T10:00:00Z', now)).toBe('Editable por 24 h 0 min');
    expect(lockCountdown('2026-11-02T15:20:00Z', now)).toBe('Editable por 5 h 20 min');
    expect(lockCountdown('2026-11-02T10:45:00Z', now)).toBe('Editable por 45 min');
    expect(lockCountdown('2026-11-02T10:00:00Z', now)).toBe('Bloqueada');
    expect(lockCountdown('2026-11-01T10:00:00Z', now)).toBe('Bloqueada');
  });
});

describe('<NoteForm>', () => {
  it('exige los cuatro campos SOEP', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<NoteForm submitLabel="Guardar" onSubmit={onSubmit} />);
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    for (const label of [/Subjetivo/, /Objetivo/, /Evaluación/]) await userEvent.type(screen.getByLabelText(label), 'texto');
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^P — Plan/), 'texto');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith({ subjective: 'texto', objective: 'texto', assessment: 'texto', plan: 'texto' });
  });

  it('avisa que la nota del asistente no sustituye a la del odontólogo', () => {
    renderWithProviders(<NoteForm assistant submitLabel="Guardar" onSubmit={vi.fn()} />);
    expect(screen.getByText(/no sustituye la nota SOEP del odontólogo/)).toBeInTheDocument();
  });
});

describe('<NoteCard>: bloqueo, firma y adendas', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
  });
  const renderCard = (n: EvolutionNote, userId = 'u1') => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<NoteCard note={n} userId={userId} onChanged={onChanged} />);
    return { onChanged };
  };

  it('el autor puede editar y firmar una nota dentro del plazo', () => {
    renderCard(note());
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Firmar nota' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar adenda' })).not.toBeInTheDocument();
    expect(screen.getByText(/Editable por/)).toBeInTheDocument();
  });

  it('una nota bloqueada ya no se edita: solo se corrige con adenda', () => {
    renderCard(note({ locked: true, lockAt: new Date(Date.now() - HOUR).toISOString() }));
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar adenda' })).toBeInTheDocument();
  });

  it('otro profesional solo puede leerla', () => {
    renderCard(note(), 'otro-usuario');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Firmar nota' })).not.toBeInTheDocument();
    expect(screen.getByText('Caries profunda en 46')).toBeInTheDocument();
  });

  it('las notas del asistente no se firman', () => {
    renderCard(note({ kind: 'ASSISTANT' }));
    expect(screen.getByText('Nota del asistente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Firmar nota' })).not.toBeInTheDocument();
  });

  it('firmar exige reautenticar con la contraseña', async () => {
    const { onChanged } = renderCard(note());
    await userEvent.click(screen.getByRole('button', { name: 'Firmar nota' }));
    const confirm = screen.getByRole('button', { name: 'Firmar' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Su contraseña'), 'mi-clave-segura');
    await userEvent.click(confirm);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/notes/n1/sign', { method: 'POST', body: { password: 'mi-clave-segura' } }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('la adenda se firma también con la contraseña y lleva el texto de la corrección', async () => {
    renderCard(note({ locked: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar adenda' }));
    await userEvent.type(screen.getByLabelText('Corrección o aclaración'), 'Se omitió la alergia al látex');
    await userEvent.type(screen.getByLabelText('Su contraseña'), 'mi-clave-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Firmar adenda' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/notes/n1/addenda', { method: 'POST', body: { content: 'Se omitió la alergia al látex', password: 'mi-clave-segura' } }),
    );
  });

  it('una nota firmada muestra quién la firmó, su huella y las adendas', () => {
    renderCard(
      note({
        signed: true,
        signedAt: new Date().toISOString(),
        signedBy: 'Dr. Salazar',
        contentHash: 'a'.repeat(64),
        locked: true,
        addenda: [{ id: 'a1', content: 'Aclaración posterior', author: 'Dr. Salazar', signedAt: new Date().toISOString(), contentHash: 'b'.repeat(64) }],
      }),
    );
    expect(screen.getByText(/SHA-256 aaaaaaaaaaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar integridad' })).toBeInTheDocument();
    expect(screen.getByText('Aclaración posterior')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Firmar nota' })).not.toBeInTheDocument();
  });

  it('verifica la integridad contra el servidor', async () => {
    apiMock.mockResolvedValue({ valid: true });
    renderCard(note({ signed: true, signedAt: new Date().toISOString(), signedBy: 'Dr. Salazar', contentHash: 'c'.repeat(64) }));
    await userEvent.click(screen.getByRole('button', { name: 'Verificar integridad' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/patients/p1/notes/n1/verify'));
    expect(await screen.findByText(/Integridad verificada/)).toBeInTheDocument();
  });
});
