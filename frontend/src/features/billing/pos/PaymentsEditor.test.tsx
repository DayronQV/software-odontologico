import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PaymentsEditor } from './PaymentsEditor';
import type { PosPayment } from './pos-calculations';

function Harness({ payable = 11_200, initial = [] as PosPayment[] }) {
  const [payments, setPayments] = useState<PosPayment[]>(initial);
  return (
    <>
      <PaymentsEditor payments={payments} payableCents={payable} onChange={setPayments} />
      <output data-testid="state">{JSON.stringify(payments.map((p) => [p.method, p.amount]))}</output>
    </>
  );
}

describe('PaymentsEditor: pagos mixtos', () => {
  it('agrega un pago con el saldo pendiente como monto', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Agregar pago/ }));
    expect(screen.getByTestId('state')).toHaveTextContent('[["CASH",112]]');
  });

  it('el segundo pago propone solo lo que falta', async () => {
    render(<Harness initial={[{ key: 'a', method: 'CASH', amount: 50, reference: '', cardToken: '' }]} />);
    await userEvent.click(screen.getByRole('button', { name: /Agregar pago/ }));
    expect(screen.getByTestId('state')).toHaveTextContent('[["CASH",50],["CASH",62]]');
  });

  it('pide referencia para transferencias y token para tarjetas', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Agregar pago/ }));
    const method = screen.getByLabelText('Medio de pago');

    await userEvent.selectOptions(method, 'TRANSFER');
    expect(screen.getByLabelText('N.º de transferencia')).toBeInTheDocument();
    await userEvent.selectOptions(method, 'INSURANCE');
    expect(screen.getByLabelText(/autorización del seguro/)).toBeInTheDocument();
    await userEvent.selectOptions(method, 'CARD_CREDIT');
    expect(screen.getByLabelText(/Token de tarjeta/)).toBeInTheDocument();
    await userEvent.selectOptions(method, 'CASH');
    expect(screen.queryByLabelText(/Token de tarjeta/)).not.toBeInTheDocument();
  });

  it('permite quitar un pago', async () => {
    render(<Harness initial={[{ key: 'a', method: 'CASH', amount: 50, reference: '', cardToken: '' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar pago' }));
    expect(screen.getByTestId('state')).toHaveTextContent('[]');
  });
});
