import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TagInput } from './TagInput';

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TagInput label="Alergias" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('TagInput (anamnesis)', () => {
  it('agrega con Enter y con coma, sin repetidos ni vacíos', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Alergias');
    await userEvent.type(input, 'Penicilina{Enter}');
    await userEvent.type(input, 'látex,');
    await userEvent.type(input, 'penicilina{Enter}'); // repetido (sin distinguir mayúsculas)
    await userEvent.type(input, '   {Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('["Penicilina","látex"]');
  });

  it('quita una etiqueta con su botón y la última con Retroceso', async () => {
    render(<Harness initial={['A', 'B', 'C']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar B' }));
    expect(screen.getByTestId('value')).toHaveTextContent('["A","C"]');
    await userEvent.type(screen.getByLabelText('Alergias'), '{Backspace}');
    expect(screen.getByTestId('value')).toHaveTextContent('["A"]');
  });

  it('agrega lo escrito al salir del campo', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Alergias'), 'Ibuprofeno');
    await userEvent.tab();
    expect(screen.getByTestId('value')).toHaveTextContent('["Ibuprofeno"]');
  });
});
