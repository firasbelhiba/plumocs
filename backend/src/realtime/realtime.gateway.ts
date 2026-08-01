import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

/**
 * WebSocket gateway (§14) — authenticated by the same JWT
 * (`auth: { token }` on the socket.io handshake).
 *
 * Delivery is scoped, not broadcast: each socket joins `user:<id>`, its
 * `team:<id>`, and `role:<role>`. Ticket traffic goes to the owning team
 * (admins get an all-teams room); notifications go only to their recipients.
 */
@WebSocketGateway({ cors: { origin: true }, path: '/ws' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.realtime.subscribe((event, payload) => this.route(event, payload));
  }

  /** Fan an event only to the sockets entitled to it. */
  private route(event: string, payload: Record<string, unknown>) {
    if (event === 'notification.created') {
      const userIds = Array.isArray(payload.userIds) ? (payload.userIds as string[]) : [];
      for (const id of userIds) this.server.to(`user:${id}`).emit(event, payload);
      return;
    }

    // ticket.* and sla.* — the owning team plus admins
    const teamId = typeof payload.teamId === 'string' ? payload.teamId : null;
    const assigneeId = typeof payload.assigneeId === 'string' ? payload.assigneeId : null;
    const rooms = ['role:admin'];
    if (teamId) rooms.push(`team:${teamId}`);
    if (assigneeId) rooms.push(`user:${assigneeId}`);
    if (!teamId && !assigneeId) rooms.push('role:lead'); // unrouted work: leads + admins
    this.server.to(rooms).emit(event, payload);
  }

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ??
      (client.handshake.headers['authorization'] as string)?.split(' ')[1];
    try {
      const payload = await this.jwt.verifyAsync(token ?? '', {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(`user:${payload.sub}`);
      client.join(`role:${payload.role}`);
      if (payload.teamId) client.join(`team:${payload.teamId}`);
      // leads see their team's traffic; admins see everything
      if (payload.role === 'admin') client.join('role:lead');
    } catch {
      this.logger.warn('WS connection rejected (bad token)');
      client.disconnect(true);
    }
  }
}
