import { useState } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TextareaField } from '../../../components/ui/Field';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import { PasswordConfirmDialog } from '../shared/PasswordConfirmDialog';
import { NoteForm } from './NoteForm';
import { lockCountdown, SOEP_FIELDS, type EvolutionNote } from './notes-types';

interface Props {
  note: EvolutionNote;
  userId: string;
  onChanged: () => Promise<void>;
}

/** Una nota de la bitácora: contenido, estado de bloqueo, firma, verificación de integridad y adendas. */
export function NoteCard({ note, userId, onChanged }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [addendumText, setAddendumText] = useState('');

  const isAuthor = note.authorId === userId;
  const canSign = isAuthor && note.kind === 'SOEP' && !note.signed;
  const canEdit = isAuthor && !note.locked;
  const canAmend = isAuthor && note.locked;

  const verify = async () => {
    try {
      const result = await api<{ valid: boolean }>(`/patients/${note.patientId}/notes/${note.id}/verify`);
      toast.push(result.valid ? 'success' : 'error', result.valid ? 'Integridad verificada: el contenido no fue alterado.' : '¡Atención! El contenido no coincide con la firma.');
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  };

  return (
    <article className="rounded-2xl border border-line bg-white p-5" aria-label={`Nota del ${formatDateTime(note.createdAt)}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={note.kind === 'SOEP' ? 'brand' : 'info'}>{note.kind === 'SOEP' ? 'Nota SOEP' : 'Nota del asistente'}</Badge>
          <span className="text-sm font-medium text-slate-800">{note.author ?? '—'}</span>
          <span className="text-sm text-slate-500">{formatDateTime(note.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={note.locked ? 'neutral' : 'warning'}>{lockCountdown(note.lockAt)}</Badge>
          {note.signed && <Badge tone="success">Firmada</Badge>}
        </div>
      </header>

      {editing ? (
        <div className="mt-4">
          <NoteForm
            initial={note}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await api(`/notes/${note.id}`, { method: 'PATCH', body: values });
              setEditing(false);
              toast.push('success', note.signed ? 'Nota actualizada: debe firmarse de nuevo' : 'Nota actualizada');
              await onChanged();
            }}
          />
        </div>
      ) : (
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {SOEP_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note[key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {note.signed && note.contentHash && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span>
            Firmada por <strong>{note.signedBy}</strong> el {note.signedAt ? formatDateTime(note.signedAt) : ''}
          </span>
          <code title={note.contentHash} className="rounded bg-white/70 px-1.5 py-0.5">SHA-256 {note.contentHash.slice(0, 16)}…</code>
          <button type="button" onClick={() => void verify()} className="font-medium underline underline-offset-2">Verificar integridad</button>
        </p>
      )}

      {!editing && (canEdit || canSign || canAmend) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Editar</Button>}
          {canSign && <Button size="sm" onClick={() => setSigning(true)}>Firmar nota</Button>}
          {canAmend && <Button variant="secondary" size="sm" onClick={() => setAddendumOpen(true)}>Agregar adenda</Button>}
        </div>
      )}

      {note.addenda.length > 0 && (
        <section aria-label="Adendas" className="mt-4 space-y-2 border-t border-line pt-4">
          <h4 className="text-sm font-semibold text-slate-800">Adendas firmadas</h4>
          {note.addenda.map((addendum) => (
            <div key={addendum.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="whitespace-pre-wrap">{addendum.content}</p>
              <p className="mt-1 text-xs text-amber-800">{addendum.author} · {formatDateTime(addendum.signedAt)} · SHA-256 {addendum.contentHash.slice(0, 12)}…</p>
            </div>
          ))}
        </section>
      )}

      <PasswordConfirmDialog
        open={signing}
        title="Firmar nota de evolución"
        description="Vuelva a escribir su contraseña para firmar. Se sellará la fecha y hora y una huella SHA-256 del contenido."
        confirmLabel="Firmar"
        onClose={() => setSigning(false)}
        onConfirm={async (password) => {
          await api(`/notes/${note.id}/sign`, { method: 'POST', body: { password } });
          setSigning(false);
          toast.push('success', 'Nota firmada');
          await onChanged();
        }}
      />

      <PasswordConfirmDialog
        open={addendumOpen}
        title="Adenda firmada"
        description="La nota está bloqueada. La corrección queda como una adenda firmada; la nota original no se modifica."
        confirmLabel="Firmar adenda"
        onClose={() => setAddendumOpen(false)}
        onConfirm={async (password) => {
          await api(`/notes/${note.id}/addenda`, { method: 'POST', body: { content: addendumText, password } });
          setAddendumOpen(false);
          setAddendumText('');
          toast.push('success', 'Adenda firmada');
          await onChanged();
        }}
      >
        <TextareaField label="Corrección o aclaración" rows={4} maxLength={4000} value={addendumText} onChange={(event) => setAddendumText(event.target.value)} />
      </PasswordConfirmDialog>
    </article>
  );
}
