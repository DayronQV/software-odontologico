import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { AdminLayout } from './features/admin/AdminLayout';
import { AlertRulesPage } from './features/admin/alerts/AlertRulesPage';
import { InsurersPage } from './features/admin/insurers/InsurersPage';
import { OfficesPage } from './features/admin/offices/OfficesPage';
import { ProceduresPage } from './features/admin/procedures/ProceduresPage';
import { ProfessionalsPage } from './features/admin/professionals/ProfessionalsPage';
import { SettingsPage } from './features/admin/settings/SettingsPage';
import { UsersPage } from './features/admin/users/UsersPage';
import { Spinner } from './components/ui/Feedback';
import { WaitingRoomPage } from './features/agenda/waiting/WaitingRoomPage';
import { AuditPage } from './features/audit/AuditPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { LoginPage } from './features/auth/LoginPage';
import { MfaPage } from './features/auth/MfaPage';
import { CashPage } from './features/billing/cash/CashPage';
import { InvoicesPage } from './features/billing/invoices/InvoicesPage';
import { PosPage } from './features/billing/pos/PosPage';
import { SettingsProvider } from './features/catalog/SettingsProvider';
import { HomePage } from './features/home/HomePage';
import { NotFoundPage } from './features/misc/NotFoundPage';
import { PatientFormPage } from './features/patients/form/PatientFormPage';
import { PatientsListPage } from './features/patients/list/PatientsListPage';
import { AnamnesisTab } from './features/patients/record/AnamnesisTab';
import { AppointmentsTab } from './features/patients/record/AppointmentsTab';
import { PatientRecordLayout } from './features/patients/record/PatientRecordLayout';
import { SummaryTab } from './features/patients/record/SummaryTab';
import { CASHIERS, PATIENT_STAFF, type Role } from './lib/roles';

// El calendario (FullCalendar) es lo más pesado: se descarga solo al abrir la Agenda.
const AgendaPage = lazy(() => import('./features/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })));

const guard = (roles: Role[], element: ReactElement) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />

      <Route
        element={
          <ProtectedRoute>
            <SettingsProvider>
              <AppLayout />
            </SettingsProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="account/password" element={<ChangePasswordPage />} />

        {/* Clínica: personal con acceso a pacientes */}
        <Route path="patients" element={guard(PATIENT_STAFF, <PatientsListPage />)} />
        <Route path="patients/new" element={guard(['RECEPCIONISTA'], <PatientFormPage />)} />
        <Route path="patients/:id/edit" element={guard(['RECEPCIONISTA'], <PatientFormPage />)} />
        <Route path="patients/:id" element={guard(PATIENT_STAFF, <PatientRecordLayout />)}>
          <Route index element={<SummaryTab />} />
          <Route path="anamnesis" element={<AnamnesisTab />} />
          <Route path="appointments" element={<AppointmentsTab />} />
        </Route>
        <Route
          path="agenda"
          element={guard(PATIENT_STAFF, <Suspense fallback={<Spinner />}><AgendaPage /></Suspense>)}
        />
        <Route path="waiting-room" element={guard(PATIENT_STAFF, <WaitingRoomPage />)} />

        {/* Caja y facturación */}
        <Route path="billing/pos" element={guard(CASHIERS, <PosPage />)} />
        <Route path="billing/invoices" element={guard([...CASHIERS, 'AUDITOR'], <InvoicesPage />)} />
        <Route path="billing/cash" element={guard([...CASHIERS, 'AUDITOR'], <CashPage />)} />

        {/* Sistema */}
        <Route path="admin" element={guard(['ADMIN_TI'], <AdminLayout />)}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="offices" element={<OfficesPage />} />
          <Route path="professionals" element={<ProfessionalsPage />} />
          <Route path="procedures" element={<ProceduresPage />} />
          <Route path="insurers" element={<InsurersPage />} />
          <Route path="alerts" element={<AlertRulesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="audit" element={guard(['ADMIN_TI', 'AUDITOR'], <AuditPage />)} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
