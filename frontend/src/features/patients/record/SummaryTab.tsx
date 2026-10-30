import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/Card';
import { formatCalendarDate } from '../../../lib/format';
import { CHANNEL_LABELS } from '../types';
import { usePatientRecord } from './PatientRecordLayout';

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export function SummaryTab() {
  const { patient: p } = usePatientRecord();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Datos personales">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Nacimiento">{formatCalendarDate(p.birthDate)}</Item>
          <Item label="Ocupación">{p.occupation}</Item>
          <Item label="Teléfono">{p.phone}</Item>
          <Item label="Correo">{p.email}</Item>
          <div className="sm:col-span-2"><Item label="Dirección">{p.address}</Item></div>
          <Item label="Canal de avisos">{CHANNEL_LABELS[p.preferredChannel]}</Item>
          <Item label="Autoriza contacto">{p.contactConsent ? 'Sí' : 'No'}</Item>
        </dl>
      </Card>

      <div className="space-y-6">
        <Card title="Contacto de emergencia">
          {p.emergencyContact ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Item label="Nombre">{p.emergencyContact.fullName}</Item>
              <Item label="Parentesco">{p.emergencyContact.relationship}</Item>
              <Item label="Teléfono">{p.emergencyContact.phone}</Item>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Sin contacto de emergencia.</p>
          )}
        </Card>

        {p.guardian && (
          <Card title="Tutor legal">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Nombre">{p.guardian.fullName}</Item>
              <Item label="Parentesco">{p.guardian.relationship}</Item>
              <Item label="Documento">{p.guardian.documentId}</Item>
              <Item label="Teléfono">{p.guardian.phone}</Item>
            </dl>
          </Card>
        )}

        <Card title="Seguro dental o convenio">
          {p.insurance ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Aseguradora">{p.insurance.insurerName}</Item>
              <Item label="Póliza">{p.insurance.policyNumber}</Item>
              <Item label="Vigencia">
                {p.insurance.validFrom ? formatCalendarDate(p.insurance.validFrom) : '—'} a{' '}
                {p.insurance.validUntil ? formatCalendarDate(p.insurance.validUntil) : '—'}
              </Item>
              <Item label="Cobertura">{p.insurance.coveragePercent !== null ? `${p.insurance.coveragePercent}%` : ''}</Item>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Sin seguro registrado.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
