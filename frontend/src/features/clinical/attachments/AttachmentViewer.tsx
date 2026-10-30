import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { api, apiBlob } from '../../../lib/api';
import { errorMessage } from '../../../lib/useResource';
import type { AttachmentItem } from './attachments-types';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/** Visor: imágenes planas con zoom y rotación, y vista previa de PDF. Descarga con URL firmada de 60 s. */
export function AttachmentViewer({ patientId, attachment, onClose }: { patientId: string; attachment: AttachmentItem | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!attachment) return;
    let objectUrl: string | null = null;
    let alive = true;
    setUrl(null);
    setError(null);
    setZoom(1);
    setRotation(0);
    apiBlob(`/patients/${patientId}/attachments/${attachment.id}/content`)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patientId, attachment]);

  const download = async () => {
    if (!attachment) return;
    try {
      const { url: signed } = await api<{ url: string }>(`/patients/${patientId}/attachments/${attachment.id}/download-url`);
      window.open(signed, '_blank', 'noopener');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const isPdf = attachment?.contentType === 'application/pdf';

  return (
    <Modal open={!!attachment} onClose={onClose} title={attachment?.filename ?? ''} size="xl">
      <div className="space-y-3">
        {!isPdf && (
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Herramientas del visor">
            <Button variant="secondary" size="sm" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.25))}>−</Button>
            <span className="w-14 text-center text-sm tabular-nums text-slate-600" aria-live="polite">{Math.round(zoom * 100)} %</span>
            <Button variant="secondary" size="sm" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.25))}>+</Button>
            <Button variant="secondary" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>Girar 90°</Button>
            <Button variant="ghost" size="sm" onClick={() => { setZoom(1); setRotation(0); }}>Restablecer</Button>
          </div>
        )}
        {error && <InlineError>{error}</InlineError>}
        {!url && !error && <Spinner />}
        {url && (
          <div className="flex max-h-[65vh] min-h-64 items-center justify-center overflow-auto rounded-xl bg-slate-900/90 p-2">
            {isPdf ? (
              <iframe title={attachment!.filename} src={url} className="h-[60vh] w-full rounded bg-white" />
            ) : (
              <img
                src={url}
                alt={attachment!.description || attachment!.filename}
                style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: 'transform 0.15s' }}
                className="max-h-[60vh] max-w-full origin-center object-contain"
              />
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>SHA-256: {attachment?.sha256.slice(0, 20)}…</span>
          <Button variant="secondary" size="sm" onClick={() => void download()}>Descargar</Button>
        </div>
      </div>
    </Modal>
  );
}
