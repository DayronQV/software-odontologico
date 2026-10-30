import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field, TextareaField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { DataTable, type Column } from '../../../components/ui/Table';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useProcedures } from '../../catalog/useCatalog';
import type { Procedure } from '../../catalog/types';

interface Template {
  id: string;
  procedureId: string;
  version: number;
  title: string;
  body: string;
}

const VARIABLES = ['{{paciente}}', '{{procedimiento}}', '{{profesional}}', '{{clinica}}', '{{fecha}}', '{{diente}}'];

/** Plantillas legales de consentimiento por procedimiento (RF-06). Editar crea una versión nueva. */
export function ConsentTemplatesPage() {
  const toast = useToast();
  const procedures = useProcedures();
  const loader = useCallback(() => api<Template[]>('/clinical/consent-templates'), []);
  const { data, error, loading, reload } = useResource(loader);
  const [editing, setEditing] = useState<{ procedure: Procedure; template: Template | null } | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (procedure: Procedure, template: Template | null) => {
    setEditing({ procedure, template });
    setTitle(template?.title ?? `Consentimiento informado: ${procedure.name}`);
    setBody(template?.body ?? '');
    setFormError(null);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    try {
      await api('/clinical/consent-templates', { method: 'POST', body: { procedureId: editing.procedure.id, title, body } });
      toast.push('success', 'Nueva versión de la plantilla guardada');
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const byProcedure = new Map(data?.map((t) => [t.procedureId, t]));
  const rows = (procedures.data ?? []).filter((p) => p.requiresConsent || byProcedure.has(p.id));

  const columns: Column<Procedure>[] = [
    { header: 'Procedimiento', cell: (p) => <span className="font-medium text-slate-900">{p.name}</span> },
    {
      header: 'Plantilla vigente',
      cell: (p) => {
        const template = byProcedure.get(p.id);
        return template ? <span className="text-slate-600">{template.title} <Badge tone="brand">v{template.version}</Badge></span> : <Badge tone="warning">Sin plantilla</Badge>;
      },
    },
    { header: 'Exige consentimiento', hideOnSmall: true, cell: (p) => (p.requiresConsent ? 'Sí' : 'No') },
    {
      header: 'Acciones',
      align: 'right',
      cell: (p) => (
        <Button variant="secondary" size="sm" onClick={() => open(p, byProcedure.get(p.id) ?? null)}>
          {byProcedure.has(p.id) ? 'Nueva versión' : 'Crear plantilla'}
        </Button>
      ),
    },
  ];

  return (
    <Card flush title="Consentimientos" description="Texto legal por procedimiento. Cada cambio crea una versión nueva; las firmadas conservan la versión con la que se firmaron.">
      {error && <div className="p-4"><InlineError>{error}</InlineError></div>}
      {loading && !data ? <Spinner /> : <DataTable columns={columns} rows={rows} getKey={(p) => p.id} caption="Plantillas de consentimiento" />}

      <Modal open={!!editing} onClose={() => setEditing(null)} size="xl" title={editing ? `Plantilla: ${editing.procedure.name}` : ''}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Título" value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextareaField
            label="Texto legal"
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            hint={`Variables disponibles: ${VARIABLES.join(' · ')}`}
          />
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={title.trim().length < 3 || body.trim().length < 50}>Guardar como nueva versión</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
