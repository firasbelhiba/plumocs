import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal } from '../common/decorators';

class OrganizationDto {
  @IsString() name!: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() externalRef?: string;
}

class UpdateOrganizationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() externalRef?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.organization.findMany({
      include: { _count: { select: { customers: true, tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { customers: { select: { id: true, name: true, email: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(dto: OrganizationDto, actor: Principal) {
    const org = await this.prisma.organization.create({ data: dto });
    await this.audit.write({ actor, entityType: 'organization', entityId: org.id, action: 'create' });
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, actor: Principal) {
    const org = await this.prisma.organization.update({ where: { id }, data: dto });
    await this.audit.write({ actor, entityType: 'organization', entityId: id, action: 'update' });
    return org;
  }
}

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  list() {
    return this.orgs.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.get(id);
  }

  @Post()
  create(@Body() dto: OrganizationDto, @CurrentUser() principal: Principal) {
    return this.orgs.create(dto, principal);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationDto, @CurrentUser() principal: Principal) {
    return this.orgs.update(id, dto, principal);
  }
}

@Module({
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
