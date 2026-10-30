import { useCallback, useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, InlineError, Spinner } from '../../../components/ui/Feedback';
import { Field, SelectField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { errorMessage, useResource } from '../../../lib/useResource';
import { useProcedures, useProfessionals } from '../../catalog/useCatalog';
import { usePatientRecord } from '../../patients/record/PatientRecordLayout';
import { useOpenPdf } from '../shared/useOpenPdf';
import { SigningDialog, type SigningState } from '../signing/SigningDialog';

export interface Consent {
  id: string;
  procedure: { code: string; name: string };
  template: { title: string; version: number };
  professional: string | null;
  text: string;
  createdAt: string;
  hasPdf: boolean;
  signing: SigningState;
}

/** Consentimientos informados por procedimiento (RF-06): se generan, se firman y se guardan como PDF. */
export function ConsentsTab() {
  const { patient } = usePatientRecord();
  const { user } = useAuth();
  const toast = useToast();
  const pdf = useOpenPdf();
  const loader = useCallback(() => api<Consent[]>(`/patients/${patient.id}/consents`), [patient.id]);
  const { data, error, loading, reload } = useResource(loader);
  const procedures = useProcedures();
  const professionals = useProfessionals();

  const [creating, setCreating] = useState(false);
  const [procedureId, setProcedureId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [toothCode, setToothCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signing, setSigning] = useState<Consent | null>(null);

  const needsResponsible = user?.role !== 'ODONTOLOGO';
  const dentists = professionals.data?.filter((p) => p.user) ?? [];
  const sortedProcedures = [...(procedures.data ?? [])].sort((a, b) => Number(b.requiresConsent) - Number(a.requiresConsent) || a.name.localeCompare(b.name));

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const consent = await api<Consent>(`/patients/${patient.id}/consents`, {
        method: 'POST',
        body: {
          procedureId,
          professionalId: needsResponsible ? professionalId : undefined,
          toothCode: toothCode ? Number(toothCode) : undefined,
        },
      });
      setCreating(false);
      setProcedureId('');
      setToothCode('');
      await reload();
      setSigning(consent);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Consentimientos informados"
      description="Cada procedimiento que lo requiere necesita un consentimiento firmado antes de realizarse."
      action={<Button onClick={() => setCreating(true)}>Nuevo consentimiento</Button>}
      flush
    >
      {loading && !data && <Spinner />}
      {error && <div className="p-5"><InlineError>{error}</InlineError></div>}
      {data && data.length === 0 && <EmptyState icon="file" title="Sin consentimientos" description="Genere el primero para un procedimiento." />}
      <ul className="divide-y divide-line">
        {data?.map((consent) => (
          <li key={consent.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-slate-900">{consent.procedure.name}</p>
              <p className="text-sm text-slate-500">
                {consent.template.title} · versión {consent.template.version} · Dr./Dra. {consent.professional} · {formatDateTime(consent.createdAt)}
              </p>
              {consent.signing.status === 'SIGNED' && (
                <p className="text-sm text-slate-500">
                  Firmó {consent.signing.signerName} {consent.signing.method === 'OTP' ? 'con código de un solo uso' : 'en pantalla táctil'} el {consent.signing.signedAt && formatDateTime(consent.signing.signedAt)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={consent.signing.status === 'SIGNED' ? 'success' : 'warning'}>{consent.signing.status === 'SIGNED' ? 'Firmado' : 'Pendiente de firma'}</Badge>
              {consent.signing.status === 'PENDING' && <Button size="sm" onClick={() => setSigning(consent)}>Firmar</Button>}
              <Button variant="secondary" size="sm" loading={pdf.busy === `/consents/${consent.id}/pdf`} onClick={() => void pdf.open(`/consents/${consent.id}/pdf`)}>
                {consent.signing.status === 'SIGNED' ? 'PDF firmado' : 'Vista previa'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo consentimiento">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <SelectField label="Procedimiento" value={procedureId} onChange={(event) => setProcedureId(event.target.value)}>
            <option value="">Seleccione…</option>
            {sortedProcedures.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.requiresConsent ? ' · requiere consentimiento' : ''}</option>
            ))}
          </SelectField>
          {needsResponsible && (
            <SelectField label="Odontólogo responsable" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
              <option value="">Seleccione…</option>
              {dentists.map((p) => <option key={p.id} value={p.userId}>{p.user.fullName}</option>)}
            </SelectField>
          )}
          <Field label="Diente (FDI, opcional)" type="number" inputMode="numeric" min={11} max={85} value={toothCode} onChange={(event) => setToothCode(event.target.value)} />
          {formError && <InlineError>{formError}</InlineError>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button type="submit" loading={busy} disabled={!procedureId || (needsResponsible && !professionalId)}>Generar documento</Button>
          </div>
        </form>
      </Modal>

      {signing && (
        <SigningDialog
          open
          title={signing.template.title}
          signingId={signing.signing.id}
          document={<p className="whitespace-pre-wrap">{signing.text}</p>}
          defaultSignerName={patient.isMinor ? (patient.guardian?.fullName ?? '') : patient.fullName}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            toast.push('success', 'Consentimiento firmado y guardado como PDF');
            void reload();
          }}
        />
      )}
    </Card>
  );
}
