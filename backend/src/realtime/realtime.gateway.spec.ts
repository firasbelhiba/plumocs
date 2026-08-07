import { Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Does the websocket fan-out stop at the tenant boundary?
 *
 * ROOMS USED TO CARRY NO WORKSPACE. `role:admin` was one room for the whole
 * instance, so every admin on every desk received every other desk's ticket
 * events — id, number, team, assignee. It never showed up as a bug because the
 * refetch each event triggers is RLS-scoped and came back empty, so the console
 * rendered nothing; the metadata had crossed all the same, and every console on
 * the instance woke up on every other tenant's activity.
 *
 * The contract pinned down here is therefore not "events arrive" but "events
 * arrive at one tenant only", plus the fail-closed half: an event that cannot
 * be attributed to a workspace is dropped rather than broadcast, because
 * broadcast is precisely the bug.
 */
describe('realtime fan-out is scoped to a workspace', () => {
  /** Builds a gateway whose emitted rooms we can observe. */
  function makeGateway() {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    let route!: (event: string, payload: Record<string, unknown>) => void;

    const realtime = {
      subscribe: jest.fn((handler: (e: string, p: Record<string, unknown>) => void) => {
        route = handler;
      }),
    };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u-1' }) };
    const config = { get: jest.fn().mockReturnValue('secret') };
    const workspaces = {
      slugFromHeaders: jest.fn().mockReturnValue(undefined),
      resolveForUser: jest.fn(),
    };

    const gateway = new RealtimeGateway(
      realtime as never,
      jwt as never,
      config as never,
      workspaces as never,
    );
    gateway.server = { to } as never;
    // registers route() as the subscriber — the same seam Redis delivers on
    gateway.afterInit();

    return { gateway, route, to, emit, workspaces };
  }

  /** A socket that records the rooms it was asked to join. */
  function makeSocket() {
    return { handshake: { auth: { token: 't' }, headers: {} }, data: {}, join: jest.fn(), disconnect: jest.fn() };
  }

  const rooms = (to: jest.Mock): string[] => to.mock.calls.flatMap((c) => [c[0]].flat() as string[]);

  it('drops an event that names no workspace instead of broadcasting it', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { route, to, emit } = makeGateway();

    // exactly the shape every publisher sent before workspaceId was threaded
    route('ticket.updated', { id: 'tk-1', number: 7, teamId: 't-1', assigneeId: 'u-9' });

    // Not "delivered to fewer rooms" — delivered to none. A fallback room here
    // would be the instance-wide broadcast this whole change exists to remove.
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    // failing closed must still be visible: a silent drop is an unfindable outage
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ticket.updated'));
    warn.mockRestore();
  });

  it('gives two workspaces disjoint room names for identical events', () => {
    const a = makeGateway();
    const b = makeGateway();
    const event = { id: 'tk-1', number: 7, teamId: 't-1', assigneeId: 'u-9' };

    a.route('ticket.updated', { workspaceId: 'ws-a', ...event });
    b.route('ticket.updated', { workspaceId: 'ws-b', ...event });

    // Same team id, same assignee id, same role — only the workspace differs,
    // and that alone has to be enough to keep the two apart.
    expect(rooms(a.to)).toEqual([
      'w:ws-a:role:admin',
      'w:ws-a:team:t-1',
      'w:ws-a:user:u-9',
    ]);
    expect(rooms(b.to)).toEqual([
      'w:ws-b:role:admin',
      'w:ws-b:team:t-1',
      'w:ws-b:user:u-9',
    ]);
    expect(rooms(a.to).some((r) => rooms(b.to).includes(r))).toBe(false);
  });

  it('scopes the unrouted-work room leads share', () => {
    const { route, to } = makeGateway();
    route('ticket.created', { workspaceId: 'ws-a', id: 'tk-2', teamId: null, assigneeId: null });
    expect(rooms(to)).toEqual(['w:ws-a:role:admin', 'w:ws-a:role:lead']);
  });

  it('scopes notification rooms too, because a user id is not tenant-unique', () => {
    // `users` has no workspace_id and is outside RLS, so one human can hold
    // memberships on two desks. A bare `user:<id>` room would push desk A's
    // notification text — which quotes ticket numbers — into the tab they have
    // open on desk B.
    const { route, to } = makeGateway();
    route('notification.created', {
      workspaceId: 'ws-a',
      userIds: ['u-1', 'u-2'],
      kind: 'assignment',
      text: '#1042 was assigned to you',
    });
    expect(rooms(to)).toEqual(['w:ws-a:user:u-1', 'w:ws-a:user:u-2']);
  });

  it('joins a connecting socket only to its own desk’s rooms', async () => {
    const { gateway, workspaces } = makeGateway();
    workspaces.resolveForUser.mockResolvedValue({
      workspaceId: 'ws-a',
      workspaceSlug: 'desk-a',
      role: 'admin',
      teamId: 't-1',
    });
    const client = makeSocket();

    await gateway.handleConnection(client as never);

    // admin also takes the lead room — scoped, like the rest
    expect(client.join.mock.calls.map((c) => c[0])).toEqual([
      'w:ws-a:user:u-1',
      'w:ws-a:role:admin',
      'w:ws-a:team:t-1',
      'w:ws-a:role:lead',
    ]);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('puts the same human on two desks into two disjoint sets of rooms', async () => {
    // The membership decides the rooms, never the token: role and teamId stopped
    // being claims when they became per-workspace, and the user id is identical
    // on both desks. Only the workspace prefix separates these sockets.
    const first = makeGateway();
    first.workspaces.resolveForUser.mockResolvedValue({
      workspaceId: 'ws-a', workspaceSlug: 'desk-a', role: 'admin', teamId: 't-1',
    });
    const second = makeGateway();
    second.workspaces.resolveForUser.mockResolvedValue({
      workspaceId: 'ws-b', workspaceSlug: 'desk-b', role: 'agent', teamId: 't-1',
    });

    const socketA = makeSocket();
    const socketB = makeSocket();
    await first.gateway.handleConnection(socketA as never);
    await second.gateway.handleConnection(socketB as never);

    const joinedA = socketA.join.mock.calls.map((c) => c[0] as string);
    const joinedB = socketB.join.mock.calls.map((c) => c[0] as string);
    expect(joinedA).toContain('w:ws-a:user:u-1');
    expect(joinedB).toContain('w:ws-b:user:u-1');
    expect(joinedA.some((r) => joinedB.includes(r))).toBe(false);
  });
});
