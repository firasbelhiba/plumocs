import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Role } from '../permissions';

/**
 * The header a client uses to name the desk it is talking to.
 *
 * `workspaces.slug` is the machine identity of a tenant (see the schema comment
 * on that column): /w/northwind/tickets in the console, this header on the wire.
 * Deliberately not a workspace UUID — an id in a header invites clients to
 * cache and replay one, and a slug is what the URL already carries.
 */
export const WORKSPACE_SLUG_HEADER = 'x-workspace-slug';

/** The half of a Principal that comes from a workspace_memberships row. */
export interface ResolvedMembership {
  workspaceId: string;
  /**
   * The workspace's slug, carried back so the caller can be TOLD which desk it
   * landed on.
   *
   * Without this the console has no way to learn its own workspace, so it can
   * never send the X-Workspace-Slug header — and the single-workspace fallback
   * below is the only thing keeping logins working. The day a second workspace
   * exists that fallback disables itself and every login fails. Returning the
   * slug is what lets the client stop depending on the guess.
   */
  workspaceSlug: string;
  role: Role;
  teamId: string | null;
}

/** The half of a Principal that comes from an api_keys row. */
export interface ResolvedApiKey {
  id: string;
  workspaceId: string;
  teamId: string | null;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
}

/**
 * The one place that answers "which workspace is this request in, and what may
 * this principal do there".
 *
 * Every lookup here goes through the SECURITY DEFINER functions the tenancy
 * migration installed (section 17), and that is not stylistic. NestJS runs
 * guards BEFORE interceptors, so authentication necessarily happens on a pooled
 * connection with no `app.workspace_id` bound. When Phase 3 puts row-level
 * security on `workspaces`, `workspace_memberships` and `api_keys`, an ordinary
 * SELECT from this code path returns zero rows — every API key would 401 and
 * every human would 403. The migration's answer is these functions; using them
 * now means Phase 3 is a policy change with no application change.
 */
@Injectable()
export class WorkspaceContextService {
  private readonly logger = new Logger(WorkspaceContextService.name);

  /**
   * Memoised result of the tenant-of-one probe below. A promise rather than a
   * value so concurrent first requests share one round trip instead of racing.
   * Only a *successful* single-workspace answer is cached — see soleSlug().
   */
  private soleSlugProbe?: Promise<string | null>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ---- request resolution -----------------------------------------------------

  /** The slug the caller named, if any. Blank and repeated headers are ignored. */
  slugFromHeaders(headers: Record<string, unknown> | undefined): string | undefined {
    const raw = headers?.[WORKSPACE_SLUG_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  /**
   * Resolve a human's workspace and their standing in it.
   *
   * Throws 403 rather than returning null, and 403 rather than 401: a caller
   * with a valid token who is not a member of the named desk has a perfectly
   * good credential. Answering 401 would make the console clear its tokens and
   * retry the login it just completed, forever.
   *
   * @param slug the workspace named by the request, or undefined to fall back
   *             to the single-tenant default (see soleSlug).
   */
  async resolveForUser(userId: string, slug?: string): Promise<ResolvedMembership> {
    // Nothing named a workspace. Before reaching for any instance-wide default,
    // ask the narrower question: does THIS human belong to exactly one desk?
    //
    // /auth/login and /auth/refresh cannot send the header — the console marks
    // them `auth: false` and the header is attached only to authenticated
    // requests — so on a multi-workspace instance both would fall through to
    // soleSlug(), get null, and answer 403 to every user alive. That is not a
    // hypothetical: it is what makes creating a second workspace an outage
    // rather than a data change, and it detonates at the next restart because a
    // successful probe is memoised.
    //
    // A login already knows who is asking. One active membership means there
    // was never anything to disambiguate.
    if (!slug) {
      const sole = await this.soleMembership(userId);
      if (sole) return sole;
    }

    const target = slug ?? (await this.soleSlug());
    if (!target) {
      throw new ForbiddenException(
        `More than one workspace exists — name yours with the ${WORKSPACE_SLUG_HEADER} header`,
      );
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ workspaceId: string; role: Role; teamId: string | null; membershipActive: boolean; workspaceSlug: string }>
    >(Prisma.sql`
      SELECT workspace_id      AS "workspaceId",
             role              AS "role",
             team_id           AS "teamId",
             membership_active AS "membershipActive",
             workspace_slug    AS "workspaceSlug"
      FROM app_resolve_membership(${userId}::uuid, ${target}::citext)
    `);

    // One message for "no such workspace", "workspace suspended" and "you are
    // not a member". Distinguishing them tells an attacker with one valid login
    // which desks exist on this instance, and none of the three is actionable
    // by the caller anyway.
    const row = rows[0];
    if (!row) throw new ForbiddenException('You do not have access to this workspace');

    // The per-desk switch, distinct from users.is_active which the login path
    // already checked. Offboarding somebody from one desk must not lock them out
    // of the others, so these two are checked in two different places.
    if (!row.membershipActive) {
      throw new ForbiddenException('Your access to this workspace has been disabled');
    }

    return { workspaceId: row.workspaceId, workspaceSlug: row.workspaceSlug, role: row.role, teamId: row.teamId };
  }

  /**
   * The caller's single active desk, or null when they have none or several.
   *
   * Deliberately returns null rather than picking one when there are several:
   * choosing would drop somebody into whichever desk the query planner happened
   * to return first, which is a cross-tenant answer arrived at by coin flip. The
   * caller then falls through to the instance default and, failing that, to a
   * 403 telling them to name the workspace — which is the honest reply.
   */
  private async soleMembership(userId: string): Promise<ResolvedMembership | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ workspaceId: string; role: Role; teamId: string | null; workspaceSlug: string }>
    >(Prisma.sql`
      SELECT workspace_id   AS "workspaceId",
             role           AS "role",
             team_id        AS "teamId",
             workspace_slug AS "workspaceSlug"
      FROM app_resolve_sole_membership(${userId}::uuid)
    `);

    // The function returns up to 2 rows precisely so this check can be made.
    if (rows.length !== 1) return null;

    const row = rows[0];
    return { workspaceId: row.workspaceId, workspaceSlug: row.workspaceSlug, role: row.role, teamId: row.teamId };
  }

  /**
   * Resolve an API key. Returns null when the secret matches nothing.
   *
   * Expiry is deliberately NOT filtered here — the caller distinguishes an
   * expired key from an unknown one, because a partner whose credential lapsed
   * needs to know to rotate it rather than go hunting for a typo.
   */
  async resolveApiKey(prefix: string, hash: string): Promise<ResolvedApiKey | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        workspaceId: string;
        teamId: string | null;
        name: string;
        scopes: string[];
        expiresAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT id           AS "id",
             workspace_id AS "workspaceId",
             team_id      AS "teamId",
             name         AS "name",
             scopes       AS "scopes",
             expires_at   AS "expiresAt"
      FROM app_resolve_api_key(${prefix}::text, ${hash}::text)
    `);
    return rows[0] ?? null;
  }

  /** Fire-and-forget usage stamp. Runs unbound, so it cannot be a plain UPDATE. */
  async touchApiKey(id: string): Promise<void> {
    await this.prisma.$queryRaw(Prisma.sql`SELECT app_touch_api_key(${id}::uuid)`);
  }

  // ---- unattended (worker) resolution -----------------------------------------

  /**
   * Every active tenant, for jobs that have no request and therefore no
   * principal. This is the only supported enumeration — the migration says so
   * explicitly, and it is the reason `app_active_workspaces()` returns opaque
   * ids and nothing else.
   *
   * A repeatable job runs its body ONCE PER ID returned here. A job that instead
   * queries unscoped does not fail; it silently mixes tenants, which for the
   * nightly export means the first workspace's watermark skips every other.
   */
  async activeWorkspaceIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM app_active_workspaces() AS t(id)`,
    );
    return rows.map((r) => r.id);
  }

  /**
   * Binds the tenant for the CURRENT transaction, so `app_current_workspace()`
   * — and therefore every `workspace_id` column default, the ticket-number
   * trigger, and every Phase-3 policy — sees it.
   *
   * MUST be called inside `prisma.$transaction`, because the binding is
   * transaction-local by design: a session-local setting outlives the request on
   * a pooled connection and hands the next caller this tenant's scope. Calling
   * it outside one silently binds a connection nobody will use again.
   *
   * Prefer `runInWorkspace` — it cannot be called in the wrong place.
   */
  async bind(workspaceId: string): Promise<void> {
    await this.prisma.$queryRaw(Prisma.sql`SELECT app_set_workspace(${workspaceId}::uuid)`);
  }

  /**
   * The worker's equivalent of the request interceptor: open a transaction, bind
   * the tenant, run the body.
   *
   * Every job that touches tenant data goes through this, and nothing else does.
   * A processor that queries outside it runs on an unbound connection, where
   * writes fail on NOT NULL and reads — today — quietly span every tenant.
   */
  async runInWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async () => {
      await this.bind(workspaceId);
      return fn();
    });
  }

  /**
   * Run a job body once per active tenant, sequentially.
   *
   * Sequential rather than parallel on purpose: these are background sweeps, and
   * N concurrent transactions per tick is how a nightly export starves the API
   * of connections at 02:15. One tenant's failure is logged and does not stop
   * the rest — a suspended card on desk A must not silently skip desk B's SLA
   * sweep for the night.
   */
  async forEachWorkspace(
    fn: (workspaceId: string) => Promise<void>,
    onError?: (workspaceId: string, err: unknown) => void,
  ): Promise<void> {
    for (const workspaceId of await this.activeWorkspaceIds()) {
      try {
        await this.runInWorkspace(workspaceId, () => fn(workspaceId));
      } catch (err) {
        if (onError) onError(workspaceId, err);
        else this.logger.error(`job failed for workspace ${workspaceId}`, err as Error);
      }
    }
  }

  // ---- the tenant-of-one shim -------------------------------------------------

  /**
   * The workspace to assume when the request did not name one.
   *
   * Exactly one workspace exists in production today and no client sends the
   * slug header yet, so without a default every request would 403 on the day
   * this ships. The shim is deliberately built so it CANNOT survive real
   * tenancy: it asks the database how many active workspaces there are and
   * returns null the moment the answer is not exactly one. From that point the
   * header is mandatory and there is no default to be silently wrong about.
   *
   * WORKSPACE_DEFAULT_SLUG overrides the probe, for an operator who wants to pin
   * the desk before the console starts sending the header. Nothing is hardcoded:
   * with no configuration at all the value comes from the database.
   *
   * Note this reads `workspaces.slug` directly rather than through a SECURITY
   * DEFINER function, because there is none for it. That is safe for what it is:
   * a single non-authority row, read at most once per process, and under Phase-3
   * RLS it degrades to null — i.e. the header becomes mandatory — rather than to
   * the wrong tenant. No authority is ever read this way; the membership lookup
   * above always goes through app_resolve_membership.
   */
  private async soleSlug(): Promise<string | null> {
    const configured = this.config.get<string>('workspace.defaultSlug');
    if (configured) return configured;

    if (!this.soleSlugProbe) {
      this.soleSlugProbe = this.probeSoleSlug().then(
        (slug) => {
          // A null answer is NOT memoised: a fresh database gets its first
          // workspace after boot, and caching "none" there would wedge the
          // instance until someone restarted it.
          if (slug === null) this.soleSlugProbe = undefined;
          return slug;
        },
        (err) => {
          // Nor is a failure. Caching a rejected promise turns one connection
          // blip into an outage that survives the blip.
          this.soleSlugProbe = undefined;
          throw err;
        },
      );
    }
    return this.soleSlugProbe;
  }

  private async probeSoleSlug(): Promise<string | null> {
    const ids = await this.activeWorkspaceIds();
    if (ids.length !== 1) {
      this.logger.warn(
        `${ids.length} active workspaces — requests must name one with the ${WORKSPACE_SLUG_HEADER} header`,
      );
      return null;
    }
    const ws = await this.prisma.workspace.findUnique({
      where: { id: ids[0] },
      select: { slug: true },
    });
    if (!ws) return null;
    this.logger.log(`Single-tenant instance — defaulting unnamed requests to workspace "${ws.slug}"`);
    return ws.slug;
  }
}
