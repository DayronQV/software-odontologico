import { useCallback, useRef, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field, SelectField } from '../../../components/ui/Field';
import { Icon } from '../../../components/ui/Icon';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { AttachmentViewer } from './AttachmentViewer';
import { ACCEPTED_TYPES, formatSize, KIND_LABELS, MAX_UPLOAD_BYTES, type AttachmentItem, type AttachmentKind } from './attachments-types';

/** Radiografías, fotos clínicas y PDFs del paciente. Cada subida, vista y descarga queda auditada. */
export function AttachmentsTab() {
  const { patient } = usePatientRecord();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const loader = useCallback(() => api<AttachmentItem[]>(`/patients/${patient.id}/attachments`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<AttachmentKind | ''>('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AttachmentItem | null>(null);

  const choose = (selected: File | null) => {
    setUploadError(null);
    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      setUploadError('El archivo supera el máximo de 15 MB.');
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (kind) form.append('kind', kind);
      if (description.trim()) form.append('description', description.trim());
      await api(`/patients/${patient.id}/attachments`, { method: 'POST', formData: form });
      toast.push('success', 'Archivo adjuntado');
      setFile(null);
      setDescription('');
      setKind('');
      if (input.current) input.current.value = '';
      await reload();
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Adjuntar archivo" description="Radiografías y fotos (PNG, JPG, WebP) o PDF, hasta 15 MB. No se admiten DICOM ni 3D.">
        <form
          className="grid gap-4 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Archivo
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
              className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-800"
            />
          </label>
          <SelectField label="Tipo" value={kind} onChange={(event) => setKind(event.target.value as AttachmentKind | '')}>
            <option value="">Automático</option>
            {(Object.keys(KIND_LABELS) as AttachmentKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </SelectField>
          <Field label="Descripción (opcional)" maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} />
          <Button type="submit" loading={busy} disabled={!file}>Subir</Button>
        </form>
        {uploadError && <div className="mt-3"><InlineError>{uploadError}</InlineError></div>}
      </Card>

      <Card title="Archivos del paciente" flush>
        {loading && !data && <Spinner />}
        {error && <div className="p-5"><InlineError>{error}</InlineError></div>}
        {data && data.length === 0 && <EmptyState icon="file" title="Sin archivos adjuntos" description="Suba la primera radiografía, foto o documento." />}
        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((item) => (
            <li key={item.id} className="bg-white">
              <button type="button" onClick={() => setViewing(item)} className="flex min-h-24 w-full items-start gap-3 p-4 text-left transition hover:bg-slate-50">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon name="file" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{item.filename}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge tone="brand">{KIND_LABELS[item.kind]}</Badge>
                    {formatSize(item.sizeBytes)}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{formatDateTime(item.createdAt)} · {item.uploadedBy}</span>
                  {item.description && <span className="mt-1 block text-sm text-slate-600">{item.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <AttachmentViewer patientId={patient.id} attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
