import { Module } from '@nestjs/common';
import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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

  async update(id: string, dto: UpdateUserDto, actor: Principal) {
    const ws = actor.workspaceId;
    const before = await this.get(id, actor); // also asserts they are a member here
    // The DTO spans two tables now. Splitting it explicitly — rather than
    // spreading it into one update — is what stops a future field being sent
    // to whichever table happens to accept it.
    const { name, avatarUrl, isActive, role, teamId, availability } = dto;
    await this.prisma.$transaction(async () => {
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
    await this.prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: id } },
      data: { isActive: false },
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
