import { Module } from '@nestjs/common';
import { Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsIn(['agent', 'lead', 'admin']) role!: 'agent' | 'lead' | 'admin';
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsUUID() teamId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['agent', 'lead', 'admin']) role?: 'agent' | 'lead' | 'admin';
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['available', 'away']) availability?: 'available' | 'away';
  @IsOptional() @IsString() avatarUrl?: string;
}

/**
 * The user row itself. `role`, `teamId` and `availability` are NOT here any
 * more — they belong to a membership, because the same person can be an admin
 * on one desk and an agent on another.
 *
 * This was a live runtime hazard rather than a compile error: `select:` is
 * passed as a variable, and TypeScript only excess-property-checks object
 * literals. So the old select kept naming columns the schema no longer has,
 * compiled clean, and would have thrown on the first request.
 */
const PUBLIC_USER = {
  id: true, email: true, name: true,
  isActive: true, avatarUrl: true, lastActiveAt: true, createdAt: true,
} as const;

/** The per-workspace half, folded back into the shape clients already expect. */
const membershipSelect = (workspaceId: string) => ({
  where: { workspaceId },
  select: { role: true, teamId: true, isActive: true, availability: true },
  take: 1,
});

type UserRow = { memberships?: { role: string; teamId: string | null; isActive: boolean; availability: string }[] };

/**
 * Flatten user + membership into the flat object the console has always
 * received. Keeping the wire shape stable means the frontend does not have to
 * change in the same deployment as the schema — one risky change at a time.
 */
function withMembership<T extends UserRow>(u: T) {
  const m = u.memberships?.[0];
  const { memberships: _drop, ...rest } = u;
  return {
    ...rest,
    role: m?.role ?? null,
    teamId: m?.teamId ?? null,
    availability: m?.availability ?? 'available',
    // A user with no membership in this workspace is not a member of it. The
    // caller sees them as inactive rather than as an agent with no role.
    isMember: !!m,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Members of the caller's workspace only.
   *
   * The filter moved from "every active user" to "has a membership here",
   * which is the tenancy boundary: without it, adding a second workspace would
   * have every desk listing every other desk's staff.
   */
  list(actor: Principal, includeInactive = false) {
    const ws = actor.workspaceId;
    return this.prisma.user
      .findMany({
        where: {
          memberships: { some: { workspaceId: ws, ...(includeInactive ? {} : { isActive: true }) } },
          ...(includeInactive ? {} : { isActive: true }),
        },
        select: { ...PUBLIC_USER, memberships: membershipSelect(ws) },
        orderBy: { name: 'asc' },
      })
      .then((rows) => rows.map(withMembership));
  }

  async get(id: string, actor: Principal) {
    const ws = actor.workspaceId;
    const user = await this.prisma.user.findFirst({
      // findFirst, not findUnique: a user outside this workspace must read as
      // absent, not as a user with no role.
      where: { id, memberships: { some: { workspaceId: ws } } },
      select: { ...PUBLIC_USER, memberships: membershipSelect(ws) },
    });
    if (!user) throw new NotFoundException('User not found');
    return withMembership(user);
  }

  async create(dto: CreateUserDto, actor: Principal) {
    const ws = actor.workspaceId;
    // One transaction: an account with no membership can sign in and belong
    // nowhere, which is a confusing half-state to leave behind on failure.
    const user = await this.prisma.$transaction(async () => {
      const created = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: await argon2.hash(dto.password),
        },
        select: PUBLIC_USER,
      });
      await this.prisma.workspaceMembership.create({
        data: { workspaceId: ws, userId: created.id, role: dto.role, teamId: dto.teamId ?? null },
      });
      return created;
    });
    await this.audit.write({ actor, entityType: 'user', entityId: user.id, action: 'create', diff: { role: dto.role } });
    return { ...user, role: dto.role, teamId: dto.teamId ?? null, availability: 'available', isMember: true };
  }

  /**
   * Refuse anything that would leave this desk with no administrator.
   *
   * There is no in-product way back from that state: every route that could
   * promote somebody is itself `@Roles('admin')`, so a workspace that loses its
   * last admin needs a hand on the database. The paths that get there are
   * ordinary — an admin demoting a colleague, or (the likely one) an admin
   * offboarding themselves on their last day.
   *
   * WHY IT COUNTS MEMBERSHIPS AND NOT USERS. Role lives on the membership, so
   * one human can be an admin of this desk and an agent on another. Counting
   * `users` would let the admin of a different workspace hold this one open.
   *
   * WHY BOTH ACTIVE FLAGS. `m.is_active` is "still on this desk" and
   * `u.is_active` is "may authenticate at all" — same pairing the roster report
   * uses. An admin whose account is globally disabled cannot sign in, so
   * counting them would hand the desk to somebody who cannot open it.
   *
   * WHY `FOR UPDATE` AND NOT A COUNT. This is the whole point of the guard. Two
   * admins demoting each other at the same moment both read "2 admins", both
   * pass a plain count, and both commit — nobody is left. The lock is what
   * serialises them: the second transaction blocks on the same rows, and under
   * READ COMMITTED Postgres re-evaluates the WHERE clause against the committed
   * version once the lock is granted, so the demoted admin drops out of the
   * result and the second caller correctly sees itself as the last one.
   *
   * Both tables are locked, not just the membership. Row re-evaluation only
   * happens for relations named in `FOR UPDATE OF`, so locking `m` alone would
   * miss a concurrent `is_active = false` on `users` — the re-check would still
   * see the stale, enabled user row and wave the demotion through. That is the
   * exact pair of requests (`PATCH` disabling one admin, `PATCH` demoting the
   * other) this is here to stop.
   *
   * `ORDER BY` gives every caller the same lock order, so two of these racing
   * queue up instead of deadlocking.
   *
   * Callers must be inside the request transaction — they are: every HTTP
   * request runs in one (WorkspaceBindingInterceptor), and PrismaService's
   * AsyncLocalStorage proxy routes `this.prisma.*` onto it. The explicit
   * `$transaction` at each call site joins that one rather than opening a
   * second, and states the requirement for any non-HTTP caller.
   */
  private async assertAdminRemains(targetUserId: string, actor: Principal) {
    const admins = await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT m.user_id AS "userId"
        FROM workspace_memberships m
        JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ${actor.workspaceId}::uuid
         AND m.role = 'admin'
         AND m.is_active
         AND u.is_active
       ORDER BY m.user_id
         FOR UPDATE OF m, u
    `);

    // Somebody else still holds the role — an ordinary demotion, not the last
    // one. This guard is only about the floor of one.
    if (admins.some((a) => a.userId !== targetUserId)) return;
    // The target is not a live admin here, so the operation removes no
    // administrator at all. This is also what keeps a desk that ALREADY has
    // none (possible: this guard is younger than the data) editable, instead of
    // freezing every user edit on it behind an error nobody can clear.
    if (!admins.some((a) => a.userId === targetUserId)) return;

    const isSelf = actor.kind === 'user' && actor.id === targetUserId;
    throw new ConflictException(
      (isSelf
        ? 'You are the last active administrator of this workspace.'
        : 'This is the last active administrator of this workspace.') +
        ' Promote another member to admin first — a desk left with no administrator' +
        ' cannot be repaired from inside the product.',
    );
  }

  async update(id: string, dto: UpdateUserDto, actor: Principal) {
    const ws = actor.workspaceId;
    const before = await this.get(id, actor); // also asserts they are a member here
    // The DTO spans two tables now. Splitting it explicitly — rather than
    // spreading it into one update — is what stops a future field being sent
    // to whichever table happens to accept it.
    const { name, avatarUrl, isActive, role, teamId, availability } = dto;
    await this.prisma.$transaction(async () => {
      // Two ways this request can cost the desk an administrator, and they are
      // written to different tables: a role that is no longer `admin`, and
      // `isActive: false`, which disables the ACCOUNT globally and so takes
      // away the admin's ability to sign in anywhere. `role: 'admin'` with
      // `isActive: false` still counts — they would end up an admin who cannot
      // log in, which is the lockout this guard exists to prevent.
      //
      // Inside the transaction and ahead of the writes: checking outside it
      // would be the plain-count race the guard documents.
      if ((role !== undefined && role !== 'admin') || isActive === false) {
        await this.assertAdminRemains(id, actor);
      }
      if (name !== undefined || avatarUrl !== undefined || isActive !== undefined) {
        await this.prisma.user.update({
          where: { id },
          data: { ...(name !== undefined ? { name } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}), ...(isActive !== undefined ? { isActive } : {}) },
        });
      }
      if (role !== undefined || teamId !== undefined || availability !== undefined) {
        await this.prisma.workspaceMembership.update({
          where: { workspaceId_userId: { workspaceId: ws, userId: id } },
          data: { ...(role !== undefined ? { role } : {}), ...(teamId !== undefined ? { teamId } : {}), ...(availability !== undefined ? { availability } : {}) },
        });
      }
    });
    const after = await this.get(id, actor);
    await this.audit.write({ actor, entityType: 'user', entityId: id, action: 'update', diff: { before, after } });
    return after;
  }

  /**
   * Deactivate, never hard-delete — replies stay on every ticket.
   *
   * Scoped to the membership: an admin of one desk removes someone from THEIR
   * desk, not from the product. Revoking the refresh tokens is still global,
   * because a token is not per-workspace — losing your last membership should
   * end the session, and losing one of several is rare enough that a re-login
   * is the honest outcome.
   */
  async deactivate(id: string, actor: Principal) {
    await this.get(id, actor); // 404s if they are not a member here
    // Deactivating the last admin — usually themselves, on the way out — is the
    // most direct route to a desk nobody can administer, so the check and the
    // write share a transaction. See assertAdminRemains.
    await this.prisma.$transaction(async () => {
      await this.assertAdminRemains(id, actor);
      await this.prisma.workspaceMembership.update({
        where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: id } },
        data: { isActive: false },
      });
    });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.write({ actor, entityType: 'user', entityId: id, action: 'deactivate' });
    return this.get(id, actor);
  }

  /** Any user may update their own availability/profile basics. */
  async updateSelf(actor: Principal, dto: { availability?: string; name?: string; avatarUrl?: string }) {
    // name/avatar are the person; availability is the desk. Two tables.
    await this.prisma.$transaction(async () => {
      if (dto.name || dto.avatarUrl !== undefined) {
        await this.prisma.user.update({
          where: { id: actor.id },
          data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}) },
        });
      }
      if (dto.availability) {
        await this.prisma.workspaceMembership.update({
          where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.id } },
          data: { availability: dto.availability },
        });
      }
    });
    return this.get(actor.id, actor);
  }
}

class UpdateSelfDto {
  @IsOptional() @IsIn(['available', 'away']) availability?: 'available' | 'away';
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() principal: Principal, @Query('includeInactive') includeInactive?: string) {
    return this.users.list(principal, includeInactive === 'true');
  }

  /** Own profile/availability — any role. Must precede :id routes. */
  @Patch('me')
  updateSelf(@CurrentUser() principal: Principal, @Body() dto: UpdateSelfDto) {
    return this.users.updateSelf(principal, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.users.get(id, principal);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateUserDto, @CurrentUser() principal: Principal) {
    return this.users.create(dto, principal);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() principal: Principal) {
    return this.users.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('admin')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.users.deactivate(id, principal);
  }
}

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
