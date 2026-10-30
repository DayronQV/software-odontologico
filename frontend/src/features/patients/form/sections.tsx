import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { CheckboxField, Field, SelectField } from '../../../components/ui/Field';
import type { Insurer } from '../../catalog/types';
import { CHANNEL_LABELS, SEX_LABELS } from '../types';
import type { PatientFormValues } from './patient-schema';

interface SectionProps {
  register: UseFormRegister<PatientFormValues>;
  errors: FieldErrors<PatientFormValues>;
}

export function PersonalSection({ register, errors }: SectionProps) {
  return (
    <Card title="Datos personales">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombres" error={errors.firstName?.message} {...register('firstName')} />
        <Field label="Apellidos" error={errors.lastName?.message} {...register('lastName')} />
        <Field label="Documento de identidad" hint="Se guarda cifrado. Opcional en menores." error={errors.documentId?.message} {...register('documentId')} />
        <Field label="Fecha de nacimiento" type="date" error={errors.birthDate?.message} {...register('birthDate')} />
        <SelectField label="Sexo" error={errors.sex?.message} {...register('sex')}>
          {Object.entries(SEX_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <Field label="Ocupación" error={errors.occupation?.message} {...register('occupation')} />
        <div className="sm:col-span-2">
          <Field label="Dirección" error={errors.address?.message} {...register('address')} />
        </div>
      </div>
    </Card>
  );
}

export function ContactSection({ register, errors }: SectionProps) {
  return (
    <Card title="Contacto y recordatorios" description="El paciente recibe la confirmación y los recordatorios de sus citas por el canal elegido.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teléfono" type="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <Field label="Correo electrónico" type="email" error={errors.email?.message} {...register('email')} />
        <SelectField label="Canal preferido" error={errors.preferredChannel?.message} {...register('preferredChannel')}>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <div className="flex items-end">
          <CheckboxField label="El paciente autoriza ser contactado" hint="Sin esta autorización no se envían mensajes." {...register('contactConsent')} />
        </div>
      </div>
    </Card>
  );
}

export function EmergencySection({ register, errors }: SectionProps) {
  return (
    <Card title="Contacto de emergencia">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nombre completo" error={errors.emergencyContact?.fullName?.message} {...register('emergencyContact.fullName')} />
        <Field label="Parentesco" error={errors.emergencyContact?.relationship?.message} {...register('emergencyContact.relationship')} />
        <Field label="Teléfono" type="tel" error={errors.emergencyContact?.phone?.message} {...register('emergencyContact.phone')} />
      </div>
    </Card>
  );
}

export function GuardianSection({ register, errors, isMinor }: SectionProps & { isMinor: boolean }) {
  return (
    <Card
      title="Tutor legal"
      description={isMinor ? 'El paciente es menor de edad: el tutor legal es obligatorio.' : 'Solo es necesario para menores de 18 años.'}
      action={isMinor ? <Badge tone="warning">Obligatorio</Badge> : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" error={errors.guardian?.fullName?.message} {...register('guardian.fullName')} />
        <Field label="Parentesco" placeholder="Madre, padre, tutor…" error={errors.guardian?.relationship?.message} {...register('guardian.relationship')} />
        <Field label="Documento de identidad" hint="Se guarda cifrado." error={errors.guardian?.documentId?.message} {...register('guardian.documentId')} />
        <Field label="Teléfono" type="tel" error={errors.guardian?.phone?.message} {...register('guardian.phone')} />
        <Field label="Correo electrónico" type="email" error={errors.guardian?.email?.message} {...register('guardian.email')} />
      </div>
    </Card>
  );
}

export function InsuranceSection({ register, errors, insurers }: SectionProps & { insurers: Insurer[] }) {
  return (
    <Card title="Seguro dental o convenio" description="Opcional.">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Aseguradora" error={errors.insurance?.insurerId?.message} {...register('insurance.insurerId')}>
          <option value="">Sin seguro</option>
          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </SelectField>
        <Field label="Número de póliza" error={errors.insurance?.policyNumber?.message} {...register('insurance.policyNumber')} />
        <Field label="Vigente desde" type="date" error={errors.insurance?.validFrom?.message} {...register('insurance.validFrom')} />
        <Field label="Vigente hasta" type="date" error={errors.insurance?.validUntil?.message} {...register('insurance.validUntil')} />
        <Field
          label="Cobertura (%)"
          type="number"
          step="0.01"
          inputMode="decimal"
          error={errors.insurance?.coveragePercent?.message}
          {...register('insurance.coveragePercent', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
        />
      </div>
    </Card>
  );
}
