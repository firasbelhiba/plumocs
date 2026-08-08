import { BadRequestException, Controller, Get, Injectable, Logger, Module, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Public, Roles } from '../common/decorators';
import { PmIdentityService, PmUserInfo } from './pm-identity.service';
import { AuthService } from '../auth/auth.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Linking a Plumo CS account to a Plumo PM one.
 *
 * DELIBERATELY A LINK, NOT A LOGIN. The caller is already authenticated to CS
 * when they start; this attaches their PM identity to the account they are
 * already in. "Sign in with Plumo" — creating or resolving a CS session from a
 * PM identity alone — is a larger question, because it decides whether PM
 * workspace membership grants access to a support desk. Until that is answered
 * deliberately, membership proves who you are and a CS invite decides whether
 * you are staff.
 */
@Injectable()
export class PmLinkService {
  private readonly logger = new Logger(PmLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Attach a PM identity to a CS user, and map the desk to a PM workspace.
   *
   * One transaction: a user linked to a PM account whose workspace mapping
   * silently failed looks connected and behaves as though it never was.
   */
  async apply(input: {
    actor: Principal;
    userId: string;
    workspaceId: string | null;
    info: PmUserInfo;
  }): Promise<{ linkedWorkspaceSlug: string | null }> {
    const { info } = input;

    // Refuse before writing, not after. The unique index would catch this too,
    // but a constraint violation surfaces as a 500 — and the operator deserves
    // to be told which account already holds the identity.
    const alreadyLinked = await this.prisma.user.findFirst({
      where: { pmUserId: info.sub, NOT: { id: input.userId } },
      select: { id: true, email: true },
    });
    if (alreadyLinked) {
      throw new BadRequestException(
        `That Plumo account is already linked to ${alreadyLinked.email}. Unlink it there first.`,
      );
    }

    let linkedWorkspaceSlug: string | null = null;

    await this.prisma.$transaction(async () => {
      await this.prisma.user.update({
        where: { id: input.userId },
        data: { pmUserId: info.sub },
      });

      if (input.workspaceId) {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: input.workspaceId },
          select: { slug: true, pmWorkspaceId: true },
        });
        // Map by SLUG, not by name or position. Both products already use the
        // same slug for the same organisation (dar-blockchain on each), and a
        // slug is the one identifier a human chose deliberately on both sides.
        const match = workspace
          ? info.workspaces.find((w) => w.slug === workspace.slug)
          : undefined;
        if (match && workspace && !workspace.pmWorkspaceId) {
          await this.prisma.workspace.update({
            where: { id: input.workspaceId },
            data: { pmWorkspaceId: match.id },
          });
          linkedWorkspaceSlug = match.slug;
        } else if (workspace?.pmWorkspaceId && workspace.pmWorkspaceId !== match?.id) {
          // Never silently repoint a desk at a different PM workspace. That
          // would move every future mapping decision under someone's feet.
          this.logger.warn(
            `Workspace ${input.workspaceId} is already mapped to PM ${workspace.pmWorkspaceId}; leaving it alone`,
          );
        }
      }
    });

    await this.audit.write({
      actor: input.actor,
      entityType: 'user',
      entityId: input.userId,
      action: 'pm.link',
      diff: { pmUserId: info.sub, workspaceSlug: linkedWorkspaceSlug },
    });

    return { linkedWorkspaceSlug };
  }

  async unlink(actor: Principal, userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { pmUserId: null } });
    await this.audit.write({ actor, entityType: 'user', entityId: userId, action: 'pm.unlink' });
  }
}

@ApiTags('pm-identity')
@Controller('auth/pm')
export class PmIdentityController {
  constructor(
    private readonly pm: PmIdentityService,
    private readonly link: PmLinkService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** The console's origin, trailing slash stripped so `${consoleUrl}/x` is never `//x`. */
  private get consoleUrl(): string {
    return (this.config.get<string>('pm.consoleUrl') ?? '').replace(/\/+$/, '');
  }

  /** Whether this deployment can offer Plumo sign-in at all, for the console to decide what to render. */
  @Get('status')
  async status(@CurrentUser() principal: Principal) {
    const me = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: { pmUserId: true },
    });
    return { available: this.pm.enabled, linked: !!me?.pmUserId };
  }

  /**
   * Start the flow. Returns the URL rather than redirecting: the console is a
   * separate origin, and a 302 from an XHR is followed opaquely by the browser
   * instead of navigating the page.
   */
  @Get('start')
  @Roles('admin')
  async start(@CurrentUser() principal: Principal, @Query('returnTo') returnTo?: string) {
    const { url } = await this.pm.beginAuthorization({
      userId: principal.id,
      linkWorkspaceId: principal.workspaceId,
      returnTo: returnTo ?? null,
    });
    return { authorizationUrl: url };
  }

  /**
   * Begin a SIGN-IN (as opposed to a link). Public: there is no session yet —
   * that is what this is for.
   *
   * Hands back a URL on THIS api rather than one on PM, and creates no state row
   * of its own. Two reasons, both load-bearing:
   *
   *   - the flow has to start with a top-level navigation to this origin, or the
   *     binding cookie set at the start is never stored (see signInRedirectUrl);
   *   - the console calls this on every render of the login screen just to
   *     decide whether to draw the button, and minting a state per render filled
   *     pm_oauth_states with rows nobody ever completed.
   *
   * So this is now a configuration check and nothing more. A deployment where PM
   * is configured but unreachable now shows the button and fails on the click
   * instead of hiding it, which is the honest order: the person clicking gets a
   * reason, where a missing button gave them nothing.
   */
  @Public()
  @Get('signin')
  signin() {
    this.pm.assertEnabled();
    return { authorizationUrl: this.pm.signInRedirectUrl };
  }

  /**
   * The hop that actually starts a sign-in, and the only place the binding
   * cookie is written.
   *
   * THE STATE IS MINTED HERE AND NEVER READ FROM THE QUERY STRING. Accepting a
   * caller-supplied state would undo the whole fix: an attacker could start
   * their own flow, then send the victim a link to this endpoint carrying that
   * state, planting the attacker's binding in the victim's browser so the forged
   * callback matches after all.
   */
  @Public()
  @Get('signin/redirect')
  async signinRedirect(@Res() reply: FastifyReply) {
    try {
      const { url, state } = await this.pm.beginAuthorization({
        userId: null,
        linkWorkspaceId: null,
        returnTo: null,
      });
      reply.header('set-cookie', this.pm.signInBindingCookie(state));
      return reply.redirect(url, 302);
    } catch (err) {
      // The browser is mid-navigation. A JSON error body would strand whoever
      // clicked on a blank page at the api's origin, with no way back.
      return reply.redirect(
        `${this.consoleUrl}/?${new URLSearchParams({
          pmSignIn: 'failed',
          reason: (err as Error).message.slice(0, 120),
        }).toString()}`,
        302,
      );
    }
  }

  /**
   * Where PM sends the browser back.
   *
   * Deliberately NOT behind the console's auth guard — this is a top-level
   * navigation from PM, so it carries no Authorization header. What authenticates
   * it instead depends on the flow, and the difference is the whole of the fix
   * below:
   *
   *   LINK.    The state row names a specific CS user, is single-use and expires.
   *            The identity is applied to that user and to nobody else, so the
   *            row is sufficient on its own.
   *   SIGN-IN. The state row names nobody, so on its own it proves only that
   *            SOMEBODY started a flow — and it belongs to whoever called
   *            /signin. The pm_signin_state cookie is the missing half.
   *
   * The @Public() is load-bearing, not decoration: without it the global
   * AuthGuard rejects the redirect before this handler runs, and every user
   * returning from PM sees a 401 they can do nothing about.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const consoleUrl = this.consoleUrl;

    // WHERE a failure lands depends on which flow this was, and getting it
    // wrong loses the message entirely: a failed SIGN-IN means nobody is
    // logged in, so /settings bounces to the login screen and the reason is
    // gone — and "your account is not linked yet" is the single most likely
    // outcome of a first attempt. Peek at the state row to find out; a link
    // names its user, a sign-in does not.
    const pending = state
      ? await this.prisma.pmOAuthState.findUnique({ where: { state }, select: { userId: true } })
      : null;
    const isSignIn = !pending?.userId;

    const back = (params: Record<string, string>) => {
      // Cleared on every terminal outcome, this one and the success below: the
      // binding is spent the moment the callback resolves, and one left behind
      // is a live credential sitting in a browser for the rest of its Max-Age.
      reply.header('set-cookie', this.pm.clearedSignInBindingCookie());
      return reply.redirect(
        isSignIn
          ? `${consoleUrl}/?${new URLSearchParams({ ...params, pmSignIn: params.pmLink ?? 'failed' }).toString()}`
          : `${consoleUrl}/settings?${new URLSearchParams(params).toString()}`,
        302,
      );
    };

    // The user pressed Deny, or PM refused. Not an error condition for us.
    if (error) return back({ pmLink: 'cancelled' });
    if (!code || !state) return back({ pmLink: 'invalid' });

    // The state row proves that A browser started this flow; the cookie proves
    // THIS one did. Checked here, before completeAuthorization, so a forged
    // callback neither consumes a state row nor spends a token request on PM.
    //
    // Only for a sign-in. A link names its user in the state row and the
    // callback applies the identity to that user alone, so a stolen link-flow
    // state cannot move anybody's session — there is nothing to bind it to that
    // the row does not already say.
    //
    // Two login tabs at once will fail the second one: the later /signin/redirect
    // overwrote the cookie. That is the binding working, not a bug — the message
    // says to try again, and trying again works.
    if (isSignIn && !this.pm.signInStateMatches(req.headers.cookie, state)) {
      return back({
        pmLink: 'invalid',
        reason: 'this sign-in did not start in this browser — please try again',
      });
    }

    try {
      const result = await this.pm.completeAuthorization({ code, state });

      // SIGN-IN: the flow began with nobody logged in, so the CS user is
      // resolved from the PM identity. The WHOLE userinfo is handed over, not
      // just `sub`: loginWithPm decides access from the caller's role in each
      // PM workspace, so it needs the workspace list. Owners and admins get in
      // and are provisioned on first sign-in; members and viewers do not.
      if (!result.userId) {
        const session = await this.auth.loginWithPm(result.userInfo);
        // The tokens go through the URL fragment, not the query string:
        // fragments are not sent to servers and stay out of access logs,
        // Referer headers and browser history entries the way a query does.
        reply.header('set-cookie', this.pm.clearedSignInBindingCookie());
        return reply.redirect(
          `${consoleUrl}/#${new URLSearchParams({
            pmSignIn: 'ok',
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          }).toString()}`,
          302,
        );
      }

      // LINK: apply the identity to the user who started the flow, and nobody
      // else — the state row named them before the redirect.
      const linked = await this.link.apply({
        actor: { kind: 'user', id: result.userId, workspaceId: result.linkWorkspaceId ?? '' } as Principal,
        userId: result.userId,
        workspaceId: result.linkWorkspaceId,
        info: result.userInfo,
      });
      return back({
        pmLink: 'ok',
        ...(linked.linkedWorkspaceSlug ? { workspace: linked.linkedWorkspaceSlug } : {}),
      });
    } catch (err) {
      // The browser is mid-navigation; a JSON error body would strand the user
      // on a blank page. Send them back to the console with a reason instead.
      return back({ pmLink: 'failed', reason: (err as Error).message.slice(0, 120) });
    }
  }

  @Get('unlink')
  @Roles('admin')
  async unlinkSelf(@CurrentUser() principal: Principal) {
    await this.link.unlink(principal, principal.id);
    return { ok: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [PmIdentityController],
  providers: [PmIdentityService, PmLinkService],
  exports: [PmIdentityService],
})
export class PmIdentityModule {}
