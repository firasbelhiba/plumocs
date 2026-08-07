import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { Principal } from '../common/decorators';
import type { Role } from '../common/permissions';
import { ResolvedMembership, WorkspaceContextService } from '../common/workspace/workspace-context.service';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitations.dto';
import { invitationState, invitationStatus, refusalFor } from './invitation-state';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Seven days.
 *
 * Long enough to survive a holiday and a forwarded mail; short enough that a
 * link sitting in an abandoned mailbox is not a standing key to a customer's
 * desk. The same number appears in the invitation email, which is why it lives
 * here as one constant rather than in two places that can drift.
 */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

/** Duplicated from auth.service.ts — see the note on issueSession below. */
function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 15 * 60_000;
  const n = parseInt(m[1], 10);
  return n * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

/** One row of app_resolve_invitation, which is the only unbound read of this table. */
interface ResolvedInvitation {
  invitationId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  workspaceActive: boolean;
  email: string;
  role: Role;
  teamId: string | null;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Invitations — "one human, one account, many desks".
 *
 * The rule that shapes every branch below: AN EXISTING EMAIL ADDS A MEMBERSHIP.
 * It never creates a second users row and never touches the password on the one
 * that exists. A contractor on three customers' desks is one person with one
 * password and three seats, and any other answer means three passwords, three
 * reset flows, and no way to tell whether the person who left has actually gone.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly workspaces: WorkspaceContextService,
  ) {}

  // ---- admin side -------------------------------------------------------------

  /**
   * Invite somebody to this desk.
   *
   * Runs inside the request's transaction (WorkspaceBindingInterceptor opened
   * it), so `workspace_id` fills itself from the binding and every read below is
   * already confined to this desk by the policy.
   */
  async create(dto: CreateInvitationDto, actor: Principal) {
    const email = dto.email.trim().toLowerCase();

    // The composite FK (workspace_id, team_id) would refuse a foreign team
    // anyway, but as a 23503 surfacing as a 500. Checked here so the admin is
    // told which field is wrong.
    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, workspaceId: actor.workspaceId },
        select: { id: true },
      });
      if (!team) throw new BadRequestException('That team does not exist on this workspace');
    }

    // ALREADY A MEMBER IS AN ERROR, NOT A NO-OP. Silently succeeding would tell
    // an admin their colleague had been invited when nothing was sent, and they
    // would wait for a mail that is never coming. `users` is global and carries
    // no policy, so this lookup spans every desk on purpose — it is asking
    // whether the PERSON exists, not whether they are here.
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (existing) {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: existing.id } },
        select: { isActive: true },
      });
      if (membership?.isActive) {
        throw new ConflictException(`${email} is already a member of this workspace.`);
      }
      // An INACTIVE membership is not an error: that is somebody who was
      // offboarded and is being brought back. accept() reactivates the row
      // rather than inserting a second one, which the (workspace_id, user_id)
      // unique key would refuse.
    }

    // RE-INVITING REPLACES. Two live tokens for one seat means revoking the one
    // you can see leaves the other working — a revocation that does not revoke.
    // This also has to happen before the insert because
    // invitations_pending_email_key allows exactly one outstanding row per
    // address per desk; the index is what makes the ordering mandatory rather
    // than merely intended.
    const replaced = await this.prisma.invitation.updateMany({
      where: { workspaceId: actor.workspaceId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        role: dto.role,
        teamId: dto.teamId ?? null,
        tokenHash: sha256(token),
        invitedById: actor.id,
        expiresAt,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    await this.audit.write({
      actor,
      entityType: 'invitation',
      entityId: invitation.id,
      action: replaced.count > 0 ? 'invitation.reissued' : 'invitation.created',
      diff: { email, role: dto.role, teamId: dto.teamId ?? null, replaced: replaced.count },
    });

    // Read rather than taken from `actor.name`: the name on the principal comes
    // from a JWT claim minted up to fifteen minutes ago, and the desk's name is
    // not on the principal at all.
    const [inviter, workspace] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true, email: true } }),
      this.prisma.workspace.findUnique({ where: { id: actor.workspaceId }, select: { name: true } }),
    ]);

    // SENT INSIDE THE REQUEST, AND ALLOWED TO FAIL IT.
    //
    // Not through the notifications queue, which cannot carry this: QueueProducer
    // .notify takes userIds, and the fanout processor writes a notifications row
    // per id — a table whose FK (notifications_membership_fkey) demands the
    // recipient already BE a member of the workspace. An invitee is by
    // definition not one. See the note at the bottom of this file.
    //
    // Failing the request is the deliberate part. Everything above is still
    // inside the request transaction, so throwing here rolls the invitation back
    // and the admin is told plainly that nothing was sent. The alternative — a
    // row that exists and an email that does not — shows "pending" in Settings
    // for an invitation nobody will ever receive, and that is indistinguishable
    // from one the invitee is ignoring.
    try {
      await this.email.sendInvitation({
        to: invitation.email,
        workspaceName: workspace?.name ?? 'Plumo CS',
        inviterName: inviter?.name || inviter?.email || 'An administrator',
        role: invitation.role,
        acceptUrl: this.acceptUrl(token),
        expiresAt: invitation.expiresAt,
      });
    } catch (err) {
      this.logger.error(`Could not email the invitation to ${invitation.email}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        `The invitation to ${invitation.email} could not be emailed, so nothing was created. Check the email settings and try again.`,
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  /** This desk's invitations, newest first. */
  async list(actor: Principal) {
    const rows = await this.prisma.invitation.findMany({
      where: { workspaceId: actor.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Resolved in one round trip rather than through a Prisma relation, because
    // there is no relation to traverse: invited_by is half of a composite FK to
    // workspace_memberships and is therefore a bare column in schema.prisma.
    const inviterIds = [...new Set(rows.map((r) => r.invitedById))];
    const inviters = inviterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: inviterIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const nameOf = new Map(inviters.map((u) => [u.id, u.name || u.email]));

    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      // A display name, because this is rendered in a table an admin reads.
      // invitedById rides along so a client that wants to link to the person can,
      // without a second endpoint.
      invitedBy: nameOf.get(r.invitedById) ?? 'Unknown',
      invitedById: r.invitedById,
      teamId: r.teamId,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      status: invitationStatus(r, now),
    }));
  }

  /**
   * Withdraw an invitation.
   *
   * A soft revoke rather than a DELETE: "who invited this person and what
   * happened to it" is exactly the question asked after somebody gets access
   * they should not have, and a deleted row answers nothing. The token stops
   * working the moment revoked_at is set — accept() checks it, and the atomic
   * claim excludes revoked rows too.
   */
  async revoke(id: string, actor: Principal) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, workspaceId: actor.workspaceId },
      select: { id: true, email: true, acceptedAt: true, revokedAt: true },
    });
    // findFirst with the workspace filter: another desk's invitation must read as
    // absent. The policy already guarantees it; saying it here means the code
    // still says what it means if the policy is ever read as optional.
    if (!invitation) throw new NotFoundException('Invitation not found');

    if (invitation.acceptedAt) {
      throw new ConflictException(
        `${invitation.email} has already accepted — remove them from Settings › People instead.`,
      );
    }
    // Idempotent: revoking twice is the same outcome as revoking once, and a
    // second click on a slow connection should not produce an error.
    if (invitation.revokedAt) return;

    await this.prisma.invitation.updateMany({
      where: { id, workspaceId: actor.workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });
    await this.audit.write({
      actor,
      entityType: 'invitation',
      entityId: id,
      action: 'invitation.revoked',
      diff: { email: invitation.email },
    });
  }

  // ---- invitee side (unauthenticated) -----------------------------------------

  /**
   * What the accept page needs before it renders a form.
   *
   * NEVER THROWS FOR A BAD TOKEN — it answers `valid: false` with a reason. This
   * is a page load, not an action: a 404 or a 410 here makes the console render
   * an error boundary instead of the sentence that tells the person what to do
   * next. The accept POST is the one that refuses with a status code.
   */
  async lookup(token: string) {
    const invalid = (reason: string) => ({
      valid: false as const,
      email: null,
      workspaceName: null,
      role: null,
      needsPassword: false,
      invitedBy: null,
      expiresAt: null,
      reason,
    });

    const row = await this.resolveToken(token);
    // Nothing is revealed about a token that matches no row — not whether it
    // ever existed, not which desk it belonged to.
    if (!row) return invalid('This invitation link is not valid. Ask for a new one.');

    const state = invitationState(row);
    if (state !== 'valid') {
      return invalid(refusalFor(state, row.workspaceName, row.expiresAt)!);
    }

    const user = await this.prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true, isActive: true },
    });
    if (user && !user.isActive) {
      return invalid('This Plumo CS account has been disabled. Contact your administrator.');
    }

    // Asked here as well as in accept() so the console can say "you are already
    // on this desk" before the person fills in a form they did not need.
    if (user && (await this.hasActiveMembership(row.workspaceId, user.id))) {
      return invalid(`You are already a member of ${row.workspaceName}. Sign in instead.`);
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: row.invitedById },
      select: { name: true, email: true },
    });

    return {
      valid: true as const,
      email: row.email,
      workspaceName: row.workspaceName,
      role: row.role,
      // FALSE when a Plumo CS account already exists for this address: accepting
      // then only adds a membership, and the body may be empty. TRUE when the
      // account has to be created, and then name and password are required.
      needsPassword: !user,
      invitedBy: inviter?.name || inviter?.email || null,
      expiresAt: row.expiresAt,
      reason: null,
    };
  }

  /**
   * Take the seat. Returns the same session shape /auth/login does.
   *
   * ONE TRANSACTION, all or nothing: the account, the membership, the accepted
   * stamp and the audit row. Half of this is a person who can sign in and belongs
   * nowhere, or a burnt invitation with no seat behind it — both of which need a
   * human to unpick, and neither of which reports itself.
   */
  async accept(token: string, dto: AcceptInvitationDto) {
    const row = await this.resolveToken(token);
    if (!row) {
      throw new NotFoundException('This invitation link is not valid. Ask for a new one.');
    }

    const state = invitationState(row);
    if (state !== 'valid') {
      const message = refusalFor(state, row.workspaceName, row.expiresAt)!;
      // A distinct status per state, so the console can act on the code alone.
      // 410 for the three that were once real and are not any more; 403 for a
      // desk that is suspended, which is about the workspace rather than the link.
      if (state === 'workspace_inactive') throw new ForbiddenException(message);
      throw new GoneException(message);
    }

    const existing = await this.prisma.user.findUnique({ where: { email: row.email } });
    if (existing && !existing.isActive) {
      throw new ForbiddenException(
        'This Plumo CS account has been disabled, so it cannot join a workspace. Contact your administrator.',
      );
    }

    const needsPassword = !existing;
    if (needsPassword && (!dto?.name?.trim() || !dto?.password)) {
      throw new BadRequestException(
        'Choose a name and a password of at least 8 characters to finish setting up your account.',
      );
    }
    // NEVER TOUCHES AN EXISTING PASSWORD, even when one is supplied. An
    // invitation proves the sender holds this mailbox; it is not proof they are
    // the person who already has this account, and quietly overwriting a
    // colleague's password because they were invited to a second desk is an
    // account takeover with a friendly wrapper. Silently ignored rather than
    // refused: the console cannot always know which case it is in, and failing a
    // legitimate accept over a field it sent by habit helps nobody.
    const passwordHash =
      needsPassword && dto.password
        ? // Hashed BEFORE the transaction opens. argon2 is deliberately slow, and
          // a couple of hundred milliseconds inside a transaction is a couple of
          // hundred milliseconds of a held connection and held row locks.
          await argon2.hash(dto.password)
        : null;

    const userId = await this.prisma.$transaction(async (tx) => {
      // 1. THE ACCOUNT, before the bind on purpose. `users` carries no
      //    workspace_id and no policy — it is global, because a person is.
      //
      //    RE-READ INSIDE THE TRANSACTION rather than reusing `existing` from
      //    above. The same address can hold invitations to two different desks,
      //    and accepting both at once would have the second `create` hit
      //    users_email_key and 500. Read committed means a commit from the other
      //    accept is visible here, so the second one takes the branch that adds a
      //    membership — which is the right answer anyway: one human, one account.
      const found = await tx.user.findUnique({ where: { email: row.email } });
      if (found && !found.isActive) {
        throw new ForbiddenException(
          'This Plumo CS account has been disabled, so it cannot join a workspace. Contact your administrator.',
        );
      }
      // Cannot happen — `found` is null only when `existing` was, and that is the
      // branch the DTO check above required a password for. Asserted rather than
      // assumed, because the alternative is inserting a null password hash.
      if (!found && !passwordHash) {
        throw new BadRequestException('Choose a name and a password of at least 8 characters.');
      }
      const user =
        found ??
        (await tx.user.create({
          data: { email: row.email, name: dto.name!.trim(), passwordHash: passwordHash! },
        }));

      // 2. THE BIND. Everything below is workspace-scoped and would otherwise
      //    run against app_current_workspace() = NULL: the reads would match
      //    nothing and the writes would be refused by the policy. Transaction
      //    local, so it cannot leak onto the next request sharing this
      //    connection. Same pattern as AuthService.createDesk.
      await tx.$executeRaw`SELECT app_set_workspace(${row.workspaceId}::uuid)`;

      // 3. CLAIM IT. This is the single-use guarantee, and it is a conditional
      //    UPDATE rather than the read above because the read cannot be atomic:
      //    two clicks on the same link a millisecond apart both pass it. Exactly
      //    one of them updates a row here; the other sees count 0 and is refused,
      //    and its whole transaction — account included — rolls back.
      const claimed = await tx.invitation.updateMany({
        where: { id: row.invitationId, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      if (claimed.count !== 1) {
        throw new GoneException(
          'This invitation has just been used. Sign in with your email address instead.',
        );
      }

      // 4. THE SEAT. Re-checked inside the transaction: lookup() asked the same
      //    question, but that was a separate round trip and somebody may have
      //    been added by hand in between.
      const membership = await tx.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: row.workspaceId, userId: user.id } },
        select: { id: true, isActive: true },
      });
      if (membership?.isActive) {
        throw new ConflictException(
          `You are already a member of ${row.workspaceName}. Sign in instead.`,
        );
      }
      if (membership) {
        // Somebody who was offboarded and has been invited back. Reactivated
        // rather than inserted, because (workspace_id, user_id) is unique and a
        // second row is not representable — and because their availability and
        // history on this desk are still here and should stay.
        await tx.workspaceMembership.update({
          where: { workspaceId_userId: { workspaceId: row.workspaceId, userId: user.id } },
          data: { isActive: true, role: row.role, teamId: row.teamId },
        });
      } else {
        await tx.workspaceMembership.create({
          data: {
            workspaceId: row.workspaceId,
            userId: user.id,
            role: row.role,
            teamId: row.teamId,
          },
        });
      }

      // 5. THE TRAIL. After the bind, because audit_log is itself
      //    workspace-scoped. actorType 'user' with the invitee as the actor: they
      //    are the one who acted, and the admin's half is already recorded on the
      //    invitation.created row.
      await tx.auditLog.create({
        data: {
          actorType: 'user',
          actorId: user.id,
          entityType: 'invitation',
          entityId: row.invitationId,
          action: 'invitation.accepted',
          diffJson: {
            email: row.email,
            role: row.role,
            teamId: row.teamId,
            invitedBy: row.invitedById,
            createdAccount: !found,
            reactivatedMembership: !!membership,
          },
        },
      });

      return user.id;
    });

    // AFTER the commit, never inside it. A refresh token minted for a
    // transaction that then rolled back is a live credential for a membership
    // that does not exist — and refresh_tokens carries no workspace_id, so it
    // would have survived the rollback of everything it refers to.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new ServiceUnavailableException('Could not complete the invitation. Please try signing in.');

    // Resolved through the ordinary login path rather than assembled from the
    // invitation, so a session issued here carries exactly the authority a login
    // would have granted a second later — and so a desk suspended between the
    // commit and this line is caught.
    const membership = await this.workspaces.resolveForUser(user.id, row.workspaceSlug);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    this.logger.log(
      `${user.email} accepted an invitation to "${row.workspaceSlug}" as ${row.role}` +
        (existing ? ' (existing account, membership added)' : ' (new account)'),
    );
    return this.issueSession(user, membership);
  }

  // ---- internals ----------------------------------------------------------------

  /**
   * The one read of `invitations` that happens with no workspace bound.
   *
   * Through app_resolve_invitation (SECURITY DEFINER) and not through Prisma,
   * because the accept routes are @Public: AuthGuard does not run, so
   * WorkspaceBindingInterceptor opens no transaction, so app_current_workspace()
   * is NULL and the workspace_isolation policy matches zero rows. A plain
   * findFirst here would not error — it would report every live invitation link
   * in the world as invalid.
   *
   * The token is hashed before it is sent, so the plaintext never reaches the
   * database, its logs or its query statistics.
   */
  private async resolveToken(token: string): Promise<ResolvedInvitation | null> {
    // Cheap shape check first: the token is 32 random bytes as hex. Anything else
    // cannot match a row, and refusing it here keeps junk out of the index.
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token.trim())) return null;

    const rows = await this.prisma.$queryRaw<ResolvedInvitation[]>(Prisma.sql`
      SELECT invitation_id    AS "invitationId",
             workspace_id     AS "workspaceId",
             workspace_slug   AS "workspaceSlug",
             workspace_name   AS "workspaceName",
             workspace_active AS "workspaceActive",
             email            AS "email",
             role             AS "role",
             team_id          AS "teamId",
             invited_by       AS "invitedById",
             expires_at       AS "expiresAt",
             accepted_at      AS "acceptedAt",
             revoked_at       AS "revokedAt"
      FROM app_resolve_invitation(${sha256(token.trim().toLowerCase())}::text)
    `);
    return rows[0] ?? null;
  }

  /**
   * Is this person already seated on that desk?
   *
   * Wrapped in runInWorkspace because workspace_memberships is under the
   * isolation policy and this is called from the unauthenticated lookup, which
   * has nothing bound. Only ever called for a workspace app_resolve_invitation
   * reported as active — app_set_workspace raises on any other.
   */
  private async hasActiveMembership(workspaceId: string, userId: string): Promise<boolean> {
    return this.workspaces.runInWorkspace(workspaceId, async () => {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { isActive: true },
      });
      return !!membership?.isActive;
    });
  }

  private acceptUrl(token: string): string {
    // The CONSOLE's origin, not appUrl. appUrl is this api — csapi.plumo.work in
    // production — which serves no pages, which is why every emailed password
    // reset link 404'd until that was found. Do not "fix" this back.
    const consoleUrl = this.config.get<string>('consoleUrl');
    return `${consoleUrl}/accept-invite?token=${token}`;
  }

  /**
   * Mint a session for a freshly seated user.
   *
   * A DELIBERATE, FLAGGED DUPLICATE of AuthService.issueTokens. That method is
   * private and this module does not own auth.service.ts, so the choice was
   * between copying twenty lines and reaching past `private` with a cast — and a
   * cast breaks at runtime, on this exact path, if the method is ever renamed.
   *
   * THE FOLLOW-UP IS TO DELETE THIS: promote AuthService.issueTokens to a public
   * `issueSession(user, membership)` and call it from here. Until then, any
   * change to token minting — rotation, claims, TTL handling — has to be made in
   * both places, and this comment is the only thing that says so.
   *
   * Note what is NOT re-checked here: for an account linked to Plumo PM
   * (users.pm_user_id), signing in through PM re-verifies the PM role and the
   * desk link every time, and this path does not. That is correct rather than an
   * oversight — an explicit invitation from an admin of THIS desk is an
   * independent grant, and the seat it creates is a CS membership like any other.
   * No password is created or changed for such an account, so the reasoning that
   * makes AuthService.resetPassword refuse them does not apply.
   */
  private async issueSession(
    user: { id: string; email: string; name: string },
    membership: ResolvedMembership,
  ) {
    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, name: user.name },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );

    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + ttlToMs(refreshTtl)),
      },
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: row.id },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { tokenHash: sha256(refreshToken) },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        teamId: membership.teamId,
      },
      workspace: {
        id: membership.workspaceId,
        slug: membership.workspaceSlug,
      },
    };
  }
}

// WHY THE INVITATION EMAIL DOES NOT GO THROUGH THE NOTIFICATIONS QUEUE
// --------------------------------------------------------------------
// Every other mail this product sends is enqueued: QueueProducer.notify stamps
// the bound workspace on the job and NotificationsFanoutProcessor writes a
// notifications row per recipient and then mails them.
//
// That path is structurally incapable of carrying an invitation. `notify` names
// its recipients as `userIds`, and the fanout's insert into `notifications` is
// held by notifications_membership_fkey — a composite FK to
// workspace_memberships (workspace_id, user_id). An invitee has no user row and
// no membership; that is what being invited means. The insert would fail 23503
// and retry to exhaustion, and nobody would receive anything.
//
// Making it queue-native means a producer method whose recipient is an ADDRESS
// rather than a user id, and a processor branch that mails without writing a
// notification row — both in files this change does not own (queue.producer.ts,
// worker-jobs/processors.ts). Worth doing; it removes SMTP latency from the
// request and gives the send BullMQ's retries. Until then the send is inline and
// its failure rolls the invitation back, which is the honest version of the same
// guarantee: an invitation exists only if it was actually sent.
