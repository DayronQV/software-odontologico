import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError, Spinner } from '../../components/ui/Feedback';
import { Field, SelectField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorMessage, useResource } from '../../lib/useResource';
import type { InventoryItem, RecipeProcedure } from './types';

interface Line {
  itemId: string;
  quantity: string;
}

/** Receta estándar de consumo por procedimiento: lo que se descuenta solo al completarlo (RF-14). */
export function RecipesTab() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === 'ADMIN_TI';
  const recipes = useResource(useCallback(() => api<RecipeProcedure[]>('/inventory/recipes'), []));
  const items = useResource(useCallback(() => api<InventoryItem[]>('/inventory/items'), []));
  const [procedureId, setProcedureId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = recipes.data?.find((r) => r.id === procedureId);
  useEffect(() => {
    setLines(current ? current.lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity) })) : []);
    setError(null);
  }, [current]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/inventory/recipes/${procedureId}`, { method: 'PUT', body: { lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity.replace(',', '.')) })) } });
      toast.push('success', 'Receta de consumo guardada');
      await recipes.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const usable = items.data?.filter((i) => i.active) ?? [];
  const valid = lines.every((l) => l.itemId && Number(l.quantity.replace(',', '.')) > 0) && new Set(lines.map((l) => l.itemId)).size === lines.length;

  return (
    <Card title="Recetas de consumo" description="Insumos y cantidades que se descuentan automáticamente del stock del profesional (o del consultorio) al completar el procedimiento.">
      {recipes.loading && !recipes.data && <Spinner />}
      {recipes.error && <InlineError>{recipes.error}</InlineError>}
      <div className="max-w-xl space-y-5">
        <SelectField label="Procedimiento" value={procedureId} onChange={(event) => setProcedureId(event.target.value)}>
          <option value="">Seleccione…</option>
          {recipes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.lines.length ? ` · ${r.lines.length} insumo(s)` : ''}</option>)}
        </SelectField>

        {procedureId && (
          <div className="space-y-3">
            {lines.length === 0 && <p className="text-sm text-slate-500">Sin receta: este procedimiento no descuenta insumos.</p>}
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                <SelectField label={index === 0 ? 'Insumo' : ''} aria-label={`Insumo ${index + 1}`} disabled={!canEdit} value={line.itemId} onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, itemId: e.target.value } : l)))}>
                  <option value="">Seleccione…</option>
                  {usable.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </SelectField>
                <Field label={index === 0 ? 'Cantidad' : ''} aria-label={`Cantidad ${index + 1}`} inputMode="decimal" disabled={!canEdit} value={line.quantity} onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))} />
                {canEdit && <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, i) => i !== index))}>Quitar</Button>}
              </div>
            ))}
            {error && <InlineError>{error}</InlineError>}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setLines([...lines, { itemId: '', quantity: '1' }])}>Agregar insumo</Button>
                <Button loading={busy} disabled={!valid} onClick={() => void save()}>Guardar receta</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
