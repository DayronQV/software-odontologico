import { useState, type ReactNode } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import { SignaturePad, type SignatureResult } from './SignaturePad';

export interface SigningState {
  id: string;
  status: 'PENDING' | 'SIGNED';
  method: 'TOUCH' | 'OTP' | null;
  signerName: string | null;
  signedAt: string | null;
  otp: { sentTo: string; expiresAt: string; attemptsLeft: number } | null;
  suggestedSignerName?: string;
}

interface Props {
  open: boolean;
  title: string;
  signingId: string;
  /** Documento que se firma (texto del consentimiento o resumen del presupuesto). */
  document: ReactNode;
  defaultSignerName?: string;
  onClose: () => void;
  onSigned: () => void;
}

type Method = 'TOUCH' | 'OTP';

/** Firma del paciente o su tutor (RF-06): en pantalla táctil o con un código de un solo uso. */
export function SigningDialog({ open, title, signingId, document, defaultSignerName = '', onClose, onSigned }: Props) {
  const [method, setMethod] = useState<Method>('TOUCH');
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [otp, setOtp] = useState<SigningState['otp']>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const state = await api<SigningState>(`/signing/${signingId}/otp`, { method: 'POST' });
      setOtp(state.otp);
      setCode('');
      if (!signerName && state.suggestedSignerName) setSignerName(state.suggestedSignerName);
    });

  const signTouch = () =>
    run(async () => {
      await api(`/signing/${signingId}/touch`, { method: 'POST', body: { signerName, ...signature } });
      onSigned();
    });

  const verify = () =>
    run(async () => {
      try {
        await api(`/signing/${signingId}/otp/verify`, { method: 'POST', body: { code, signerName } });
        onSigned();
      } catch (e) {
        // refresca los intentos que quedan para que el usuario vea el cambio
        const state = await api<SigningState>(`/signing/${signingId}`).catch(() => null);
        if (state?.otp) setOtp(state.otp);
        throw e;
      }
    });

  const nameOk = signerName.trim().length >= 3;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="space-y-5">
        <div className="max-h-56 overflow-y-auto rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{document}</div>

        <div role="tablist" aria-label="Forma de firma" className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {([['TOUCH', 'Firma en pantalla'], ['OTP', 'Código por mensaje']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              onClick={() => {
                setMethod(value);
                setError(null);
              }}
              className={`min-h-11 rounded-md px-4 text-sm font-medium transition ${method === value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <Field label="Nombre de quien firma" hint="El paciente o, si es menor de edad, su tutor legal." value={signerName} onChange={(event) => setSignerName(event.target.value)} />

        {method === 'TOUCH' ? (
          <div className="space-y-3">
            <SignaturePad onChange={setSignature} />
            <div className="flex justify-end">
              <Button loading={busy} disabled={!signature || !nameOk} onClick={() => void signTouch()}>Firmar documento</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {otp ? (
              <p className="text-sm text-slate-600" role="status">
                Enviamos un código de 6 dígitos a <strong>{otp.sentTo}</strong>. Vence a las {formatDateTime(otp.expiresAt)}.{' '}
                <Badge tone={otp.attemptsLeft > 1 ? 'neutral' : 'warning'}>Intentos restantes: {otp.attemptsLeft}</Badge>
              </p>
            ) : (
              <p className="text-sm text-slate-600">Se enviará un código al contacto registrado del paciente (o de su tutor, si es menor).</p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <Button variant="secondary" loading={busy && !code} onClick={() => void sendCode()}>{otp ? 'Reenviar código' : 'Enviar código'}</Button>
              {otp && (
                <>
                  <div className="w-44">
                    <Field
                      label="Código de 6 dígitos"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <Button loading={busy && code.length === 6} disabled={code.length !== 6 || !nameOk} onClick={() => void verify()}>Verificar y firmar</Button>
                </>
              )}
            </div>
          </div>
        )}
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Modal>
  );
}
