import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { SystemPage } from './SystemPage';
import type { BackupList, SystemStatus } from './types';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api', async (original) => ({ ...(await original<typeof import('../../../lib/api')>()), api: apiMock }));

const status: SystemStatus = {
  status: 'ok', version: '1.0.0', environment: 'production', timestamp: '2026-10-30T12:00:00Z', uptimeSeconds: 7300,
  runtime: { node: 'v24', memoryMb: 180 },
  services: { database: { status: 'up', latencyMs: 3 }, redis: { status: 'up', latencyMs: 1 }, storage: { status: 'down', latencyMs: null } },
  database: { sizeMb: 42, connections: 7 }, queue: { waiting: 2, active: 0, delayed: 1, failed: 3 },
  activity24h: { auditEntries: 120, failedLogins: 2, exports: 4 },
};

function serve(backups: BackupList) {
  apiMock.mockImplementation((path: string) => Promise.resolve(path === '/system/status' ? status : backups));
}

describe('<SystemPage>', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('muestra cada servicio con su latencia y marca el caído', async () => {
    serve({ configured: false, retentionDays: null, items: [], error: 'sin bucket' });
    renderWithProviders(<SystemPage />);
    await waitFor(() => expect(screen.getByText('Base de datos (PostgreSQL)')).toBeInTheDocument());
    expect(screen.getByText('3 ms')).toBeInTheDocument();
    expect(screen.getByText('Caído')).toBeInTheDocument();
    expect(screen.getByText(/activo hace 2 h/)).toBeInTheDocument();
    expect(screen.getByText('Envíos fallidos').closest('div')).toHaveTextContent('3');
  });

  it('avisa si los respaldos no están configurados', async () => {
    serve({ configured: false, retentionDays: null, items: [], error: 'sin bucket' });
    renderWithProviders(<SystemPage />);
    await waitFor(() => expect(screen.getByText(/almacenamiento de respaldos no está configurado/)).toBeInTheDocument());
  });

  it('lista los respaldos con su huella', async () => {
    serve({
      configured: true, retentionDays: 30,
      items: [{ id: 'a', createdAt: '2026-10-30T07:00:00Z', database: { key: 'k', bytes: 2_097_152, sha256: 'abcdef0123456789abcdef', serverVersion: '16' }, files: { total: 9, copied: 1, bytes: 10 }, retentionDays: 30 }],
    });
    renderWithProviders(<SystemPage />);
    await waitFor(() => expect(screen.getByText('2.0 MB')).toBeInTheDocument());
    expect(screen.getByText('abcdef0123456789…')).toBeInTheDocument();
  });
});
