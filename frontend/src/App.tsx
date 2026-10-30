import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { AdminLayout } from './features/admin/AdminLayout';
import { AlertRulesPage } from './features/admin/alerts/AlertRulesPage';
import { DiscountAuthorizationPage } from './features/admin/budgets/DiscountAuthorizationPage';
import { ConsentTemplatesPage } from './features/admin/consents/ConsentTemplatesPage';
import { MedicationsPage } from './features/admin/medications/MedicationsPage';
import { InsurersPage } from './features/admin/insurers/InsurersPage';
import { OfficesPage } from './features/admin/offices/OfficesPage';
import { ProceduresPage } from './features/admin/procedures/ProceduresPage';
import { ProfessionalsPage } from './features/admin/professionals/ProfessionalsPage';
import { SettingsPage } from './features/admin/settings/SettingsPage';
import { SystemPage } from './features/admin/system/SystemPage';
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
import { CommissionsLayout } from './features/commissions/CommissionsLayout';
import { RulesTab } from './features/commissions/RulesTab';
import { SettlementsTab } from './features/commissions/SettlementsTab';
import { SimulatorTab } from './features/commissions/SimulatorTab';
import { CountsTab } from './features/inventory/CountsTab';
import { InventoryLayout } from './features/inventory/InventoryLayout';
import { ItemsTab } from './features/inventory/ItemsTab';
import { KardexTab } from './features/inventory/KardexTab';
import { RecipesTab } from './features/inventory/RecipesTab';
import { StockTab } from './features/inventory/StockTab';
import { SupplyTab } from './features/inventory/SupplyTab';
import { ReportsPage } from './features/reports/ReportsPage';
import { CASHIERS, CLINICAL_STAFF, PATIENT_STAFF, type Role } from './lib/roles';

// El calendario (FullCalendar) es lo más pesado: se descarga solo al abrir la Agenda.
const AgendaPage = lazy(() => import('./features/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })));

// Las pestañas clínicas se descargan al abrirlas, para que el expediente cargue rápido (RNF-01).
const AttentionTab = lazy(() => import('./features/clinical/attention/AttentionTab').then((m) => ({ default: m.AttentionTab })));
const OdontogramTab = lazy(() => import('./features/clinical/odontogram/OdontogramTab').then((m) => ({ default: m.OdontogramTab })));
const PerioTab = lazy(() => import('./features/clinical/perio/PerioTab').then((m) => ({ default: m.PerioTab })));
const EvolutionTab = lazy(() => import('./features/clinical/notes/EvolutionTab').then((m) => ({ default: m.EvolutionTab })));
const ConsentsTab = lazy(() => import('./features/clinical/consents/ConsentsTab').then((m) => ({ default: m.ConsentsTab })));
const PrescriptionsTab = lazy(() => import('./features/clinical/prescriptions/PrescriptionsTab').then((m) => ({ default: m.PrescriptionsTab })));
const AttachmentsTab = lazy(() => import('./features/clinical/attachments/AttachmentsTab').then((m) => ({ default: m.AttachmentsTab })));
const PlanTab = lazy(() => import('./features/treatments/PlanTab').then((m) => ({ default: m.PlanTab })));
const TimelineTab = lazy(() => import('./features/clinical/timeline/TimelineTab').then((m) => ({ default: m.TimelineTab })));

const guard = (roles: Role[], element: ReactElement) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

/** Pestaña clínica: solo odontólogo y asistente, cargada bajo demanda. */
const clinicalTab = (element: ReactElement) => guard(CLINICAL_STAFF, <Suspense fallback={<Spinner />}>{element}</Suspense>);

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
          <Route path="attention" element={clinicalTab(<AttentionTab />)} />
          <Route path="odontogram" element={clinicalTab(<OdontogramTab />)} />
          <Route path="perio" element={clinicalTab(<PerioTab />)} />
          <Route path="evolution" element={clinicalTab(<EvolutionTab />)} />
          <Route path="consents" element={clinicalTab(<ConsentsTab />)} />
          <Route path="prescriptions" element={clinicalTab(<PrescriptionsTab />)} />
          <Route path="attachments" element={clinicalTab(<AttachmentsTab />)} />
          <Route path="plan" element={clinicalTab(<PlanTab />)} />
          <Route path="timeline" element={clinicalTab(<TimelineTab />)} />
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

        {/* Gestión: inventario, comisiones y reportes */}
        <Route path="inventory" element={guard(['ADMIN_TI', 'ASISTENTE', 'AUDITOR'], <InventoryLayout />)}>
          <Route index element={<StockTab />} />
          <Route path="items" element={<ItemsTab />} />
          <Route path="movements" element={<KardexTab />} />
          <Route path="recipes" element={<RecipesTab />} />
          <Route path="supply" element={<SupplyTab />} />
          <Route path="counts" element={<CountsTab />} />
        </Route>
        <Route path="commissions" element={guard(['ADMIN_TI', 'AUDITOR', 'ODONTOLOGO'], <CommissionsLayout />)}>
          <Route index element={<SettlementsTab />} />
          <Route path="rules" element={<RulesTab />} />
          <Route path="simulator" element={<SimulatorTab />} />
        </Route>
        <Route path="reports" element={guard(['ADMIN_TI', 'AUDITOR', 'ODONTOLOGO'], <ReportsPage />)} />

        {/* Sistema */}
        <Route path="admin" element={guard(['ADMIN_TI'], <AdminLayout />)}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="offices" element={<OfficesPage />} />
          <Route path="professionals" element={<ProfessionalsPage />} />
          <Route path="procedures" element={<ProceduresPage />} />
          <Route path="insurers" element={<InsurersPage />} />
          <Route path="alerts" element={<AlertRulesPage />} />
          <Route path="consents" element={<ConsentTemplatesPage />} />
          <Route path="medications" element={<MedicationsPage />} />
          <Route path="discounts" element={<DiscountAuthorizationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
        <Route path="audit" element={guard(['ADMIN_TI', 'AUDITOR'], <AuditPage />)} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
