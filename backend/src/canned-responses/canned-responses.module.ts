import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';

class CreateCannedDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsUUID() teamId?: string;
}

class UpdateCannedDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsUUID() teamId?: string;
}

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Searchable list for the composer — everyone. */
  list(q?: string) {
    return this.prisma.cannedResponse.findMany({
      where: q
        ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }] }
        : {},
      include: { team: { select: { id: true, name: true } } },
      orderBy: { title: 'asc' },
    });
  }

  /** Leads manage team-scoped responses (their team); admins anything (incl. global). */
  private assertManage(actor: Principal, teamId: string | null | undefined) {
    if (actor.kind === 'api_key') throw new ForbiddenException();
    if (actor.role === 'admin') return;
    if (actor.role === 'lead' && teamId && teamId === actor.teamId) return;
    throw new ForbiddenException(teamId ? 'Outside your team' : 'Global responses are admin-only');
  }

  create(dto: CreateCannedDto, actor: Principal) {
    this.assertManage(actor, dto.teamId ?? null);
    return this.prisma.cannedResponse.create({
      data: { ...dto, tags: dto.tags ?? [], createdById: actor.id },
    });
  }

  async update(id: string, dto: UpdateCannedDto, actor: Principal) {
    const existing = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Canned response not found');
    this.assertManage(actor, existing.teamId);
    if (dto.teamId !== undefined) this.assertManage(actor, dto.teamId);
    return this.prisma.cannedResponse.update({ where: { id }, data: dto });
  }

  async remove(id: string, actor: Principal) {
    const existing = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Canned response not found');
    this.assertManage(actor, existing.teamId);
    await this.prisma.cannedResponse.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('canned-responses')
@Controller('canned-responses')
export class CannedResponsesController {
  constructor(private readonly canned: CannedResponsesService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.canned.list(q);
  }

  @Post()
  @Roles('lead')
  create(@Body() dto: CreateCannedDto, @CurrentUser() principal: Principal) {
    return this.canned.create(dto, principal);
  }

  @Patch(':id')
  @Roles('lead')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCannedDto, @CurrentUser() principal: Principal) {
    return this.canned.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('lead')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.canned.remove(id, principal);
  }
}

@Module({
  providers: [CannedResponsesService],
  controllers: [CannedResponsesController],
})
export class CannedResponsesModule {}
