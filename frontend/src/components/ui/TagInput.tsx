import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

interface TagInputProps {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

/** Lista de textos cortos (alergias, enfermedades…): Enter o coma agregan; cada etiqueta se quita con la X. */
export function TagInput({ label, hint, value, onChange, placeholder }: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const text = draft.trim();
    if (text && !value.some((v) => v.toLowerCase() === text.toLowerCase())) onChange([...value, text]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-sm text-brand-800 ring-1 ring-inset ring-brand-200">
            {tag}
            <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-brand-100">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[10ch] flex-1 bg-transparent px-1 py-1 text-base text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
