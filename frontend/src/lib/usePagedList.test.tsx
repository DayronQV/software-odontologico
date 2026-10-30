import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuery, usePagedList } from './usePagedList';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), api: apiMock }));

const page = (items: string[]) => ({ items, total: items.length, page: 1, pageSize: 10 });

describe('buildQuery', () => {
  it('omite valores vacíos y codifica el resto', () => {
    expect(buildQuery({ q: 'ana pérez', active: true, page: 2, empty: '', none: undefined })).toBe('?q=ana+p%C3%A9rez&active=true&page=2');
    expect(buildQuery({})).toBe('');
  });
});

describe('usePagedList', () => {
  beforeEach(() => {
    // con llaves: si el callback devolviera el mock, Vitest lo ejecutaría como "limpieza"
    apiMock.mockReset();
    apiMock.mockResolvedValue(page(['a']));
  });

  it('pide la primera página con los filtros', async () => {
    const { result } = renderHook(() => usePagedList('/patients', { pageSize: 10, filters: { q: 'ana' } }));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(apiMock).toHaveBeenCalledWith('/patients?q=ana&page=1&pageSize=10');
  });

  it('cambia de página', async () => {
    const { result } = renderHook(() => usePagedList('/patients', { pageSize: 10 }));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.setPage(3));
    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith('/patients?page=3&pageSize=10'));
  });

  it('al cambiar los filtros vuelve a la página 1', async () => {
    const { result, rerender } = renderHook(({ q }) => usePagedList('/patients', { pageSize: 10, filters: { q } }), { initialProps: { q: 'a' } });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.setPage(4));
    await waitFor(() => expect(result.current.page).toBe(4));

    rerender({ q: 'b' });
    expect(result.current.page).toBe(1);
    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith('/patients?q=b&page=1&pageSize=10'));
  });

  it('reporta el error del servidor', async () => {
    apiMock.mockImplementation(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => usePagedList('/patients'));
    await waitFor(() => expect(result.current.error).toBe('No se pudo conectar con el servidor.'));
  });
});
