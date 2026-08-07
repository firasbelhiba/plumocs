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
 * `team:<id>`, and `role:<role>` WITHIN its workspace (see room() below).
 * Ticket traffic goes to the owning team (admins get an all-teams room);
 * notifications go only to their recipients.
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

/**
 * Every room name is workspace-first: `w:<workspaceId>:role:admin`, and so on.
 *
 * Rooms used to be named `role:admin`, `team:<id>`, `user:<id>` with no tenant
 * in them at all. That was invisible while one workspace existed and became a
 * cross-tenant leak the day a second one did: every desk's admins shared one
 * `role:admin` room, so a ticket filed on one desk pushed its id, number, team
 * and assignee to the other desk's console. Subject and body never travel in an
 * event and the refetch it triggers is still RLS-scoped, which is exactly why
 * nobody noticed — but the metadata had already crossed, and every console on
 * the instance refetched on every other tenant's activity.
 *
 * Team and user ids are no safer bare than roles. `users` carries no
 * workspace_id and sits outside RLS, so a user id is global and one human can
 * hold memberships on two desks; an unscoped `user:<id>` room would deliver
 * desk A's notification text to the tab they have open on desk B. Workspace ids
 * are uuids and contain no colon, so the prefix cannot be confused with the
 * room name that follows it.
 */
const room = (workspaceId: string, name: string) => `w:${workspaceId}:${name}`;

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
    // Fail closed, the direction the RLS migration took. An event that does not
    // name its tenant cannot be scoped, and the only other thing to do with it
    // is the instance-wide broadcast this method used to perform. A publisher
    // that forgets loses realtime updates on one path and says so in the log;
    // broadcasting leaks every path in silence. Expect a burst of these during
    // a rolling deploy, while replicas on the old code are still publishing.
    const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : '';
    if (!workspaceId) {
      this.logger.warn(`dropped ${event}: payload names no workspace`);
      return;
    }

    if (event === 'notification.created') {
      const userIds = Array.isArray(payload.userIds) ? (payload.userIds as string[]) : [];
      for (const id of userIds) this.server.to(room(workspaceId, `user:${id}`)).emit(event, payload);
      return;
    }

    // ticket.* and sla.* — the owning team plus admins
    const teamId = typeof payload.teamId === 'string' ? payload.teamId : null;
    const assigneeId = typeof payload.assigneeId === 'string' ? payload.assigneeId : null;
    const rooms = [room(workspaceId, 'role:admin')];
    if (teamId) rooms.push(room(workspaceId, `team:${teamId}`));
    if (assigneeId) rooms.push(room(workspaceId, `user:${assigneeId}`));
    // unrouted work: leads + admins
    if (!teamId && !assigneeId) rooms.push(room(workspaceId, 'role:lead'));
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

      // Rooms come from the membership the handshake just resolved, so a socket
      // is only ever in the fan-out of the ONE desk it authenticated into. A
      // human who belongs to two desks opens two sockets and lands in two
      // disjoint sets of rooms — which is the only way `user:<id>` can be
      // correct, since the id is identical on both.
      const ws = membership.workspaceId;
      client.join(room(ws, `user:${payload.sub}`));
      client.join(room(ws, `role:${membership.role}`));
      if (membership.teamId) client.join(room(ws, `team:${membership.teamId}`));
      // leads see their team's traffic; admins see everything
      if (membership.role === 'admin') client.join(room(ws, 'role:lead'));
    } catch {
      this.logger.warn('WS connection rejected (bad token or no workspace membership)');
      client.disconnect(true);
    }
  }
}
