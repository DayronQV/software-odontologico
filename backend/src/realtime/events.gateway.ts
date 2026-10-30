import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { SessionService } from '../auth/session.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WebSockets seguros (WSS cuando se accede por Nginx/TLS). El JWT viaja en el handshake
 * (`auth.token`) y se valida ANTES de aceptar la conexión: solo se admiten tokens con MFA
 * verificado y sesión viva. Salas: `user:<id>` y `role:<ROL>` para notificaciones dirigidas
 * (sala de espera, cambios de cita…).
 */
@WebSocketGateway({
  path: '/ws',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayInit {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((error: Error) => {
          this.logger.warn(`Conexión WS rechazada: ${error.message}`);
          next(new Error('No autorizado'));
        });
    });
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string') throw new Error('Token requerido');

    const payload = await this.tokens.verifyAccess(token);
    if (!payload.mfa) throw new Error('MFA sin verificar');
    if (!(await this.sessions.exists(payload.sid))) throw new Error('Sesión expirada');

    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true },
    });
    if (!user?.active) throw new Error('Usuario inactivo');

    client.data.user = { id: user.id, role: user.role, sessionId: payload.sid };
    await client.join([`user:${user.id}`, `role:${user.role}`]);
  }

  @SubscribeMessage('ping')
  async onPing(@ConnectedSocket() client: Socket) {
    const user = client.data.user as { id: string; sessionId: string } | undefined;
    if (!user || !(await this.sessions.exists(user.sessionId))) {
      client.disconnect(true);
      return { event: 'error', data: { message: 'No autorizado' } };
    }
    return { event: 'pong', data: { userId: user.id, ts: new Date().toISOString() } };
  }

  emitToRole(role: Role, event: string, payload: unknown): void {
    this.server?.to(`role:${role}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
