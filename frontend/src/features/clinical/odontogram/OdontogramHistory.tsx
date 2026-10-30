import { useCallback } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { InlineError, Spinner } from '../../../components/ui/Feedback';
import { Modal } from '../../../components/ui/Modal';
import { api } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { useResource } from '../../../lib/useResource';
import { FINDING_TYPES, STATUS_LABELS, SURFACE_LABELS, type Finding } from './findings';

/** Historial de cambios del odontograma: quién y cuándo creó o cerró cada hallazgo (RF-03). */
export function OdontogramHistory({ patientId, toothCode, open, onClose }: { patientId: string; toothCode: number | null; open: boolean; onClose: () => void }) {
  const loader = useCallback(
    () => api<Finding[]>(`/patients/${patientId}/odontogram/history${toothCode ? `?toothCode=${toothCode}` : ''}`),
    [patientId, toothCode],
  );
  const { data, error, loading } = useResource(loader);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={toothCode ? `Historial del diente ${toothCode}` : 'Historial del odontograma'}>
      {loading && !data && <Spinner />}
      {error && <InlineError>{error}</InlineError>}
      {data && data.length === 0 && <p className="text-sm text-slate-500">Todavía no hay cambios registrados.</p>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">Registro</th>
                <th className="py-2 pr-3">Diente</th>
                <th className="py-2 pr-3">Hallazgo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2">Cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {data.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3">
                    <div className="text-slate-800">{formatDateTime(row.createdAt)}</div>
                    <div className="text-xs text-slate-500">{row.createdBy ?? '—'}</div>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.toothCode}</td>
                  <td className="py-2 pr-3">
                    {FINDING_TYPES[row.type].label}
                    <div className="text-xs text-slate-500">{SURFACE_LABELS[row.surface]}</div>
                  </td>
                  <td className="py-2 pr-3">{STATUS_LABELS[row.status]}</td>
                  <td className="py-2">
                    {row.removedAt ? (
                      <>
                        <div className="text-slate-800">{formatDateTime(row.removedAt)}</div>
                        <div className="text-xs text-slate-500">{row.removedBy} · {row.removalReason}</div>
                      </>
                    ) : (
                      <Badge tone="success">Vigente</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
