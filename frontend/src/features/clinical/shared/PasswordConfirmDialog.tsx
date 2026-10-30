import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { InlineError } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { errorMessage } from '../../../lib/useResource';

interface Props {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onClose: () => void;
  /** Recibe la contraseña; si falla, el mensaje se muestra y el diálogo sigue abierto. */
  onConfirm: (password: string) => Promise<void>;
  children?: ReactNode;
}

/** Reautenticación para firmar (RF-05): el profesional vuelve a escribir su contraseña. */
export function PasswordConfirmDialog({ open, title, description, confirmLabel, onClose, onConfirm, children }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
      setPassword('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={close}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-slate-600">{description}</div>
        {children}
        <Field
          label="Su contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        {error && <InlineError>{error}</InlineError>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={password.length === 0}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
