import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';

class TeamDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

class MembershipDto {
  @IsUUID() userId!: string;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Team membership is a property of a workspace membership now, not of the
   * user — so `Team.users` is gone and members are reached through
   * WorkspaceMembership. The `users` key is rebuilt on the way out so the
   * console keeps receiving the shape it already renders.
   */
  private static readonly memberInclude = (workspaceId: string) => ({
    memberships: {
      where: { workspaceId },
      select: { role: true, availability: true, user: { select: { id: true, name: true } } },
    },
  });

  private static flatten<T extends { memberships: { role: string; availability: string; user: { id: string; name: string } }[] }>(team: T) {
    const { memberships, ...rest } = team;
    return { ...rest, users: memberships.map((m) => ({ ...m.user, role: m.role, availability: m.availability })) };
  }

  async list(actor: Principal) {
    const teams = await this.prisma.team.findMany({
      where: { workspaceId: actor.workspaceId },
      include: TeamsService.memberInclude(actor.workspaceId),
      orderBy: { name: 'asc' },
    });
    return teams.map(TeamsService.flatten);
  }

  async get(id: string, actor: Principal) {
    const team = await this.prisma.team.findFirst({
      // findFirst with the workspace filter: a team in another workspace must
      // read as absent, not as a team with no members.
      where: { id, workspaceId: actor.workspaceId },
      include: TeamsService.memberInclude(actor.workspaceId),
    });
    if (!team) throw new NotFoundException('Team not found');
    return TeamsService.flatten(team);
  }

  async create(dto: TeamDto, actor: Principal) {
    const team = await this.prisma.team.create({ data: dto });
    await this.audit.write({ actor, entityType: 'team', entityId: team.id, action: 'create' });
    return team;
  }

  async update(id: string, dto: TeamDto, actor: Principal) {
    const team = await this.prisma.team.update({ where: { id }, data: dto });
    await this.audit.write({ actor, entityType: 'team', entityId: id, action: 'update' });
    return team;
  }

  async remove(id: string, actor: Principal) {
    await this.get(id, actor); // 404s rather than deleting another workspace's team
    // Scoped to this workspace: the same team id cannot exist elsewhere, but
    // writing the filter anyway keeps the statement true if that ever changes.
    await this.prisma.workspaceMembership.updateMany({
      where: { workspaceId: actor.workspaceId, teamId: id },
      data: { teamId: null },
    });
    await this.prisma.team.delete({ where: { id } });
    await this.audit.write({ actor, entityType: 'team', entityId: id, action: 'delete' });
    return { ok: true };
  }

  /** Leads may edit membership of their own team only; admins any team. */
  async setMembership(teamId: string, userId: string, join: boolean, actor: Principal) {
    // The membership IS the thing being edited now: role and team both live on
    // it. Looking the user up instead would find people who belong to another
    // desk entirely and let a lead here move them.
    const target = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId } },
      select: { role: true, teamId: true, user: { select: { id: true, name: true } } },
    });
    if (!target) throw new NotFoundException('User not found');

    if (actor.kind === 'user' && actor.role === 'lead') {
      if (actor.teamId !== teamId) throw new ForbiddenException('Leads can only edit their own team');
      // a lead may not remove somebody who isn't in their team…
      if (!join && target.teamId !== teamId) throw new ForbiddenException('That person is not in your team');
      // …nor move leads/admins around, nor orphan themselves out of scope
      if (target.role !== 'agent') throw new ForbiddenException('Only admins can move leads and admins between teams');
    }

    const updated = await this.prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId } },
      data: { teamId: join ? teamId : null },
      select: { teamId: true, user: { select: { id: true, name: true } } },
    });
    const user = { ...updated.user, teamId: updated.teamId };
    await this.audit.write({
      actor, entityType: 'team', entityId: teamId,
      action: join ? 'member.add' : 'member.remove', diff: { userId },
    });
    return user;
  }
}

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.teams.list(principal);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.teams.get(id, principal);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: TeamDto, @CurrentUser() principal: Principal) {
    return this.teams.create(dto, principal);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TeamDto, @CurrentUser() principal: Principal) {
    return this.teams.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.teams.remove(id, principal);
  }

  @Post(':id/members')
  @Roles('lead')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MembershipDto, @CurrentUser() principal: Principal) {
    return this.teams.setMembership(id, dto.userId, true, principal);
  }

  @Delete(':id/members/:userId')
  @Roles('lead')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() principal: Principal,
  ) {
    return this.teams.setMembership(id, userId, false, principal);
  }
}

@Module({
  providers: [TeamsService],
  controllers: [TeamsController],
  exports: [TeamsService],
})
export class TeamsModule {}
