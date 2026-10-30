import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/Toast';
import { AuthContext } from '../../../lib/auth';
import type { Role } from '../../../lib/roles';
import { fakeAuth } from '../../../test/utils';
import type { Patient } from '../types';
import { PatientRecordLayout } from './PatientRecordLayout';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

const patient: Patient = {
  id: 'p1', firstName: 'Carlos', lastName: 'Mendoza', fullName: 'Carlos Mendoza', documentId: '0912345678', birthDate: '1984-06-15', age: 42, isMinor: false,
  sex: 'MALE', address: null, phone: null, email: null, occupation: null, preferredChannel: 'WHATSAPP', contactConsent: true, active: true, createdAt: '',
  guardian: null, emergencyContact: null, insurance: null, hasMedicalHistory: true, alerts: [],
};

function renderAs(role: Role) {
  apiMock.mockResolvedValue(patient);
  const auth = fakeAuth({ phase: 'authenticated', user: { id: 'u1', email: 'x@sigo.test', fullName: 'Usuario', role } });
  render(
    <MemoryRouter initialEntries={['/patients/p1']}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <Routes>
            <Route path="/patients/:id" element={<PatientRecordLayout />}>
              <Route index element={<p>Resumen del paciente</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const CLINICAL_TABS = ['Atención', 'Odontograma', 'Periodontograma', 'Evolución', 'Consentimientos', 'Recetas', 'Adjuntos', 'Plan y presupuesto', 'Línea de tiempo'];

describe('<PatientRecordLayout>: pestañas del expediente según el perfil', () => {
  beforeEach(() => apiMock.mockReset());

  it.each<Role>(['ODONTOLOGO', 'ASISTENTE'])('%s ve todas las pestañas clínicas', async (role) => {
    renderAs(role);
    const nav = await screen.findByRole('navigation', { name: 'Secciones del expediente' });
    for (const tab of CLINICAL_TABS) expect(within(nav).getByRole('link', { name: tab })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Anamnesis' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Citas' })).toBeInTheDocument();
  });

  it('recepción NO ve el contenido clínico: solo resumen, anamnesis y citas', async () => {
    renderAs('RECEPCIONISTA');
    const nav = await screen.findByRole('navigation', { name: 'Secciones del expediente' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Resumen', 'Anamnesis', 'Citas']);
    for (const tab of CLINICAL_TABS) expect(within(nav).queryByRole('link', { name: tab })).not.toBeInTheDocument();
  });
});
