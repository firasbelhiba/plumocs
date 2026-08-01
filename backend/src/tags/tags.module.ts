import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

class CreateTagDto {
  @Matches(/^[a-z0-9-]+$/) key!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() color?: string;
}

class UpdateTagDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() color?: string;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const tags = await this.prisma.tag.findMany({ orderBy: { key: 'asc' } });
    // usage counts from tickets.tags[]
    const rows = await this.prisma.$queryRaw<Array<{ tag: string; n: bigint }>>`
      SELECT unnest(tags) AS tag, count(*) AS n FROM tickets GROUP BY 1`;
    const counts = new Map(rows.map((r) => [r.tag, Number(r.n)]));
    return tags.map((t) => ({ ...t, count: counts.get(t.key) ?? 0 }));
  }

  create(dto: CreateTagDto) {
    return this.prisma.tag.create({ data: dto });
  }

  async update(id: string, dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.$executeRaw`UPDATE tickets SET tags = array_remove(tags, ${tag.key})`;
    await this.prisma.tag.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list() {
    return this.tags.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tags.remove(id);
  }
}

@Module({
  providers: [TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
