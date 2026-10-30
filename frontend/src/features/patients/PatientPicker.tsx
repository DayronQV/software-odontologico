import { useEffect, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { api } from '../../lib/api';
import { initials } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { Paged } from '../../lib/usePagedList';
import type { PatientListItem } from './types';

export interface PickedPatient {
  id: string;
  fullName: string;
}

interface Props {
  label: string;
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  error?: string;
}

/** Buscador de pacientes con resultados mientras se escribe (nombre, apellido o documento exacto). */
export function PatientPicker({ label, value, onChange, error }: Props) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 250);
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api<Paged<PatientListItem>>(`/patients?active=true&pageSize=8&q=${encodeURIComponent(query)}`)
      .then((page) => !cancelled && setResults(page.items))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-3 py-2">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(value.fullName)}</span>
            <span className="font-medium text-slate-900">{value.fullName}</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="text-sm font-medium text-brand-700 hover:underline">Cambiar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor="patient-search" className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="patient-search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nombre, apellido o documento exacto"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className={`min-h-11 w-full rounded-lg border bg-white pl-9 pr-3 text-base shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${error ? 'border-rose-400' : 'border-line'}`}
        />
      </div>
      {query.length >= 2 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-line bg-white shadow-sm" aria-label="Resultados">
          {searching && <li className="px-3 py-3 text-sm text-slate-500">Buscando…</li>}
          {!searching && results.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Sin resultados</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange({ id: p.id, fullName: p.fullName })} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-50">
                <span className="font-medium text-slate-900">{p.fullName}</span>
                <span className="text-xs text-slate-500">{p.age} años {p.documentMasked ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
