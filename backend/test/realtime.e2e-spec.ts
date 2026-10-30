import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import { bearer, createSession, createTestApp, createUser, http, login } from './helpers';

describe('WebSockets autenticados con JWT', () => {
  let app: INestApplication;
  let url: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(async () => {
    open.forEach((s) => s.close());
    await app.close();
  });

  const connect = (token?: string) => {
    const socket = io(url, {
      path: '/ws',
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
    });
    open.push(socket);
    return socket;
  };
  const once = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve) => socket.once(event, (payload: T) => resolve(payload)));

  it('acepta un token con MFA verificado y responde al ping', async () => {
    const s = await createSession(app, Role.ASISTENTE);
    const socket = connect(s.accessToken);
    await once(socket, 'connect');
    const pong = once<{ userId: string }>(socket, 'pong');
    socket.emit('ping');
    expect((await pong).userId).toBe(s.user.id);
  });

  it('rechaza conexiones sin token en el handshake', async () => {
    const socket = connect();
    const error = await once<Error>(socket, 'connect_error');
    expect(error.message).toBe('No autorizado');
    expect(socket.connected).toBe(false);
  });

  it('rechaza tokens manipulados', async () => {
    const s = await createSession(app, Role.ASISTENTE);
    const socket = connect(s.accessToken.slice(0, -4) + 'AAAA');
    await once(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  it('rechaza tokens sin MFA verificado', async () => {
    const user = await createUser(app, Role.ASISTENTE);
    const partial = (await login(app, user.email, user.password)).body;
    const socket = connect(partial.accessToken);
    await once(socket, 'connect_error');
    expect(socket.connected).toBe(false);
  });

  it('corta la conexión cuando la sesión termina (logout)', async () => {
    const s = await createSession(app, Role.AUDITOR);
    const socket = connect(s.accessToken);
    await once(socket, 'connect');
    await http(app).post('/api/auth/logout').set(bearer(s.accessToken)).expect(204);
    const closed = once(socket, 'disconnect');
    socket.emit('ping');
    await closed;
    expect(socket.connected).toBe(false);
  });
});
