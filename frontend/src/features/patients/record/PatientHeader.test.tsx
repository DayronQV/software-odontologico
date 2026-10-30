import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Patient } from '../types';
import { PatientHeader } from './PatientHeader';

const base: Patient = {
  id: 'p1', firstName: 'Carlos', lastName: 'Mendoza', fullName: 'Carlos Mendoza', documentId: '0912345678', birthDate: '1984-06-15', age: 42, isMinor: false,
  sex: 'MALE', address: null, phone: null, email: null, occupation: null, preferredChannel: 'WHATSAPP', contactConsent: true, active: true, createdAt: '',
  guardian: null, emergencyContact: null, insurance: null, hasMedicalHistory: true, alerts: [],
};
const penicillin = { ruleId: 'r1', label: 'Alergia a penicilina', kind: 'DRUG_ALLERGY', severity: 'CRITICAL' as const, detail: 'Penicilina' };
const diabetes = { ruleId: 'r2', label: 'Diabetes', kind: 'SYSTEMIC_DISEASE', severity: 'WARNING' as const };

describe('PatientHeader: badge de alertas médicas (RF-02)', () => {
  it('muestra la alergia a penicilina como alerta crítica de alta visibilidad', () => {
    renderWithProviders(<PatientHeader patient={{ ...base, alerts: [penicillin] }} canEdit={false} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Alergia a penicilina');
    expect(alert.className).toContain('bg-rose-600');
  });

  it('ordena críticas primero y distingue las advertencias', () => {
    renderWithProviders(<PatientHeader patient={{ ...base, alerts: [penicillin, diabetes] }} canEdit={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('penicilina');
    expect(screen.getByRole('status')).toHaveTextContent('Diabetes');
  });

  it('sin alertas ni pendientes no muestra la franja de alertas', () => {
    renderWithProviders(<PatientHeader patient={base} canEdit={false} />);
    expect(screen.queryByLabelText('Alertas médicas')).not.toBeInTheDocument();
  });

  it('avisa cuando falta la anamnesis', () => {
    renderWithProviders(<PatientHeader patient={{ ...base, hasMedicalHistory: false }} canEdit={false} />);
    expect(screen.getByLabelText('Alertas médicas')).toHaveTextContent('Anamnesis pendiente');
  });

  it('solo recepción ve «Editar ficha»; todos pueden agendar', () => {
    const { unmount } = renderWithProviders(<PatientHeader patient={base} canEdit={false} />);
    expect(screen.queryByText('Editar ficha')).not.toBeInTheDocument();
    expect(screen.getByText('Agendar cita')).toBeInTheDocument();
    unmount();
    renderWithProviders(<PatientHeader patient={base} canEdit />);
    expect(screen.getByText('Editar ficha')).toBeInTheDocument();
  });

  it('indica menor de edad e inactivo', () => {
    renderWithProviders(<PatientHeader patient={{ ...base, isMinor: true, active: false, age: 8 }} canEdit={false} />);
    expect(screen.getByText('Menor de edad')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });
});
