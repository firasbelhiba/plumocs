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

  list() {
    return this.prisma.team.findMany({
      include: { users: { select: { id: true, name: true, role: true, availability: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { users: { select: { id: true, name: true, role: true, availability: true } } },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
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
    await this.prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
    await this.prisma.team.delete({ where: { id } });
    await this.audit.write({ actor, entityType: 'team', entityId: id, action: 'delete' });
    return { ok: true };
  }

  /** Leads may edit membership of their own team only; admins any team. */
  async setMembership(teamId: string, userId: string, join: boolean, actor: Principal) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, teamId: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (actor.kind === 'user' && actor.role === 'lead') {
      if (actor.teamId !== teamId) throw new ForbiddenException('Leads can only edit their own team');
      // a lead may not remove somebody who isn't in their team…
      if (!join && target.teamId !== teamId) throw new ForbiddenException('That person is not in your team');
      // …nor move leads/admins around, nor orphan themselves out of scope
      if (target.role !== 'agent') throw new ForbiddenException('Only admins can move leads and admins between teams');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { teamId: join ? teamId : null },
      select: { id: true, name: true, teamId: true },
    });
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
  list() {
    return this.teams.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.teams.get(id);
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
