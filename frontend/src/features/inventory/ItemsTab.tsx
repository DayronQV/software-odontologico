import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorMessage, useResource } from '../../lib/useResource';
import type { InventoryItem } from './types';

const EMPTY = { code: '', name: '', unit: '', unitCost: '', minStock: '' };

/** Catálogo de insumos (resinas, anestesias, guantes…). Solo el administrador lo edita. */
export function ItemsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN_TI';
  const { data, error, loading, reload } = useResource(useCallback(() => api<InventoryItem[]>('/inventory/items'), []));
  const [editing, setEditing] = useState<{ id: string | null; active: boolean } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (item: InventoryItem | null) => {
    setEditing({ id: item?.id ?? null, active: item?.active ?? true });
    setForm(item ? { code: item.code, name: item.name, unit: item.unit, unitCost: String(item.unitCost), minStock: String(item.minStock) } : EMPTY);
    setFormError(null);
  };

  const save = async () => {
    try {
      const body = { code: form.code.trim().toUpperCase(), name: form.name, unit: form.unit, unitCost: Number(form.unitCost), minStock: Number(form.minStock), active: editing?.active };
      await api(editing?.id ? `/inventory/items/${editing.id}` : '/inventory/items', { method: editing?.id ? 'PUT' : 'POST', body });
      toast.push('success', 'Insumo guardado');
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const columns: Column<InventoryItem>[] = [
    { header: 'Código', cell: (i) => <code className="text-xs">{i.code}</code> },
    { header: 'Insumo', cell: (i) => <span className="font-medium text-slate-900">{i.name}</span> },
    { header: 'Unidad', hideOnSmall: true, cell: (i) => i.unit },
    { header: 'Costo', align: 'right', cell: (i) => i.unitCost.toFixed(2) },
    { header: 'Mínimo', align: 'right', cell: (i) => i.minStock },
    { header: 'Estado', cell: (i) => <Badge tone={i.active ? 'success' : 'neutral'}>{i.active ? 'Activo' : 'Inactivo'}</Badge> },
    ...(isAdmin ? [{ header: 'Acciones', align: 'right' as const, cell: (i: InventoryItem) => <Button variant="secondary" size="sm" onClick={() => open(i)}>Editar</Button> }] : []),
  ];

  return (
    <Card flush title="Insumos" action={isAdmin && <Button onClick={() => open(null)}>Nuevo insumo</Button>}>
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : <DataTable columns={columns} rows={data ?? []} getKey={(i) => i.id} caption="Insumos" />}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar insumo' : 'Nuevo insumo'}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código" hint="Mayúsculas, números y guiones." value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Field label="Unidad" placeholder="g, ml, par…" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <Field label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Costo por unidad" inputMode="decimal" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
            <Field label="Stock mínimo" inputMode="decimal" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
          </div>
          {editing?.id && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Insumo activo
            </label>
          )}
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" disabled={!form.code || !form.name || !form.unit || form.unitCost === '' || form.minStock === ''}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
