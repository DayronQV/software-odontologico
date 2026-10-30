import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onSessionExpired, tokens } from './api';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('cliente API', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokens.set({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    tokens.clear();
    onSessionExpired(null);
  });

  it('envía el JWT en la cabecera Authorization', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access-1');
  });

  it('no envía token en endpoints públicos', async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await api('/auth/login', { method: 'POST', body: { a: 1 }, auth: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('renueva el token al expirar y reintenta la petición', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Token inválido o expirado' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));

    await expect(api('/users')).resolves.toEqual({ data: 1 });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer access-2');
    expect(tokens.refresh).toBe('refresh-2');
  });

  it('varias peticiones simultáneas comparten UNA sola renovación', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
      if (url === '/api/auth/refresh') return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      return init.headers.Authorization === 'Bearer access-1'
        ? json(401, { message: 'Token inválido o expirado' })
        : json(200, { ok: true });
    });

    await Promise.all([api('/a'), api('/b'), api('/c')]);
    const refreshes = fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh');
    expect(refreshes).toHaveLength(1);
  });

  it('si no se puede renovar, limpia la sesión y avisa a la aplicación', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Sesión expirada por inactividad' }))
      .mockResolvedValueOnce(json(401, { message: 'Sesión expirada por inactividad' }));

    await expect(api('/users')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(tokens.access).toBeNull();
    expect(tokens.refresh).toBeNull();
  });

  it('un 401 por datos incorrectos (p. ej. código MFA) NO cierra la sesión', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Código MFA inválido' }));

    await expect(api('/auth/mfa/verify', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'Código MFA inválido',
    });
    expect(expired).not.toHaveBeenCalled();
    expect(tokens.access).toBe('access-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('une los mensajes de validación en un solo texto', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: ['email inválido', 'rol inválido'] }));
    await expect(api('/users', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'email inválido. rol inválido',
    });
  });

  it('maneja respuestas 204 sin cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
