import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlertBadge } from './AlertBadge';
import { Button } from './Button';
import { Field } from './Field';
import { Modal } from './Modal';
import { DataTable } from './Table';
import { ToastProvider, useToast } from './Toast';

describe('AlertBadge (RF-02: alerta médica de alta visibilidad)', () => {
  it('el nivel crítico se anuncia como alerta, con ícono y texto', () => {
    render(<AlertBadge level="critical">Alergia a penicilina</AlertBadge>);
    const badge = screen.getByRole('alert');
    expect(badge).toHaveTextContent('Alergia a penicilina');
    expect(badge).toHaveTextContent('⚠');
    expect(badge.className).toContain('bg-red-600');
  });

  it('los demás niveles son estados informativos', () => {
    render(<AlertBadge level="success">Todo bien</AlertBadge>);
    expect(screen.getByRole('status')).toHaveTextContent('Todo bien');
  });
});

describe('Button', () => {
  it('tiene objetivo táctil de 44 px y no es de tipo submit por defecto', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('min-h-11');
  });

  it('se deshabilita mientras carga', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Procesando');
  });
});

describe('Field', () => {
  it('asocia etiqueta, error y estado inválido', () => {
    render(<Field label="Correo" error="Correo inválido" />);
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Correo inválido');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('muestra la ayuda cuando no hay error', () => {
    render(<Field label="Clave" hint="Mínimo 12 caracteres" />);
    expect(screen.getByText('Mínimo 12 caracteres')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('se cierra con Escape cuando es descartable', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Título" onClose={onClose}>
        contenido
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Título' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('no se cierra con Escape cuando exige una acción', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Aviso" onClose={onClose} dismissible={false}>
        contenido
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no renderiza nada cerrado', () => {
    render(
      <Modal open={false} title="X" onClose={() => undefined}>
        oculto
      </Modal>,
    );
    expect(screen.queryByText('oculto')).not.toBeInTheDocument();
  });
});

describe('DataTable', () => {
  const columns = [{ header: 'Nombre', cell: (r: { n: string }) => r.n }];

  it('muestra filas y un texto cuando no hay datos', () => {
    const { rerender } = render(
      <DataTable columns={columns} rows={[{ n: 'Ana' }]} getKey={(r) => r.n} caption="Personas" />,
    );
    expect(screen.getByRole('table', { name: 'Personas' })).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} getKey={(r: { n: string }) => r.n} caption="Personas" empty="Nadie" />);
    expect(screen.getByText('Nadie')).toBeInTheDocument();
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.push('error', 'Algo falló')}>mostrar</button>;
  }

  it('muestra el aviso y lo retira solo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider durationMs={1000}>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('mostrar'));
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló');
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
