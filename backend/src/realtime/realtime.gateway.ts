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
import { WorkspaceContextService } from '../common/workspace/workspace-context.service';

/**
 * WebSocket gateway (§14) — authenticated by the same JWT
 * (`auth: { token }` on the socket.io handshake).
 *
 * Delivery is scoped, not broadcast: each socket joins `user:<id>`, its
 * `team:<id>`, and `role:<role>`. Ticket traffic goes to the owning team
 * (admins get an all-teams room); notifications go only to their recipients.
 */
/**
 * Origins are taken from the same CORS_ORIGINS list the HTTP side uses, rather
 * than reflecting whatever origin asks. socket.io's polling transport is a real
 * cross-origin HTTP request, so `origin: true` here would leave the hole the
 * HTTP config was tightened to close. Unset (local development) still reflects.
 */
const wsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({ cors: { origin: wsOrigins.length ? wsOrigins : true }, path: '/ws' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly workspaces: WorkspaceContextService,
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
      // Rooms are named from the MEMBERSHIP, not from the token. role and teamId
      // stopped being claims when they became per-workspace, and reading them
      // off the payload now would silently produce a `role:undefined` room and
      // no team room at all — a socket that connects, stays connected, and
      // receives nothing. Same lookup the HTTP guard performs, so a socket can
      // never be scoped more widely than the requests on the same credential.
      const slug =
        (client.handshake.auth?.workspaceSlug as string | undefined) ??
        this.workspaces.slugFromHeaders(client.handshake.headers as Record<string, unknown>);
      const membership = await this.workspaces.resolveForUser(payload.sub, slug);

      client.data.userId = payload.sub;
      client.data.role = membership.role;
      client.data.workspaceId = membership.workspaceId;
      client.join(`user:${payload.sub}`);
      client.join(`role:${membership.role}`);
      if (membership.teamId) client.join(`team:${membership.teamId}`);
      // leads see their team's traffic; admins see everything
      if (membership.role === 'admin') client.join('role:lead');
    } catch {
      this.logger.warn('WS connection rejected (bad token or no workspace membership)');
      client.disconnect(true);
    }
  }
}
