import { BadRequestException, Controller, Get, Injectable, Logger, Module, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';
import { PmIdentityService, PmUserInfo } from './pm-identity.service';

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
  ) {}

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
    const url = await this.pm.beginAuthorization({
      userId: principal.id,
      workspaceId: principal.workspaceId,
      returnTo: returnTo ?? null,
    });
    return { authorizationUrl: url };
  }

  /**
   * Where PM sends the browser back.
   *
   * Deliberately NOT behind the console's auth guard — this is a top-level
   * navigation from PM, so it carries no Authorization header. The state row is
   * what authenticates it: it was created for a specific CS user, is single-use,
   * and expires. That is stronger than a session cookie here, because it also
   * proves the callback belongs to the flow that started.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const consoleUrl = (this.config.get<string>('pm.consoleUrl') ?? '').replace(/\/+$/, '');
    const back = (params: Record<string, string>) =>
      reply.redirect(`${consoleUrl}/settings?${new URLSearchParams(params).toString()}`, 302);

    // The user pressed Deny, or PM refused. Not an error condition for us.
    if (error) return back({ pmLink: 'cancelled' });
    if (!code || !state) return back({ pmLink: 'invalid' });

    try {
      const result = await this.pm.completeAuthorization({ code, state });
      const linked = await this.link.apply({
        actor: { kind: 'user', id: result.userId, workspaceId: result.workspaceId ?? '' } as Principal,
        userId: result.userId,
        workspaceId: result.workspaceId,
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
  controllers: [PmIdentityController],
  providers: [PmIdentityService, PmLinkService],
  exports: [PmIdentityService],
})
export class PmIdentityModule {}
