import { useMemo } from 'react';
import { SelectField } from '../../../components/ui/Field';
import type { Office, Professional } from '../../catalog/types';

export interface AgendaFilterValues {
  officeId: string;
  chairId: string;
  professionalId: string;
}

interface Props {
  values: AgendaFilterValues;
  offices: Office[];
  professionals: Professional[];
  /** El odontólogo solo ve su propia agenda: no se le ofrece filtrar por profesional. */
  allowProfessionalFilter: boolean;
  onChange: (values: AgendaFilterValues) => void;
}

/** Filtros por consultorio, sillón y profesional (RF-09). */
export function AgendaFilters({ values, offices, professionals, allowProfessionalFilter, onChange }: Props) {
  const chairs = useMemo(() => offices.find((o) => o.id === values.officeId)?.chairs.filter((c) => c.active) ?? [], [offices, values.officeId]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SelectField label="Consultorio" value={values.officeId} onChange={(e) => onChange({ ...values, officeId: e.target.value, chairId: '' })}>
        <option value="">Todos</option>
        {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </SelectField>
      <SelectField label="Sillón" value={values.chairId} disabled={!values.officeId} onChange={(e) => onChange({ ...values, chairId: e.target.value })}>
        <option value="">{values.officeId ? 'Todos' : 'Elija consultorio'}</option>
        {chairs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      {allowProfessionalFilter && (
        <SelectField label="Profesional" value={values.professionalId} onChange={(e) => onChange({ ...values, professionalId: e.target.value })}>
          <option value="">Todos</option>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.user.fullName}</option>)}
        </SelectField>
      )}
    </div>
  );
}
