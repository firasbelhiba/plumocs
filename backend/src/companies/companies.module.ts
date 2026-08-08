import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';

class CompanyDto {
  @IsString() name!: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() externalRef?: string;
}

class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() externalRef?: string;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.company.findMany({
      include: { _count: { select: { customers: true, tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { customers: { select: { id: true, name: true, email: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async create(dto: CompanyDto, actor: Principal) {
    const company = await this.prisma.company.create({ data: dto });
    // entityType 'company', not 'organization'. There are no historical rows
    // under the old value to keep compatible with — the table was never used, so
    // no create or update ever wrote an audit row for one.
    await this.audit.write({ actor, entityType: 'company', entityId: company.id, action: 'create' });
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor: Principal) {
    const company = await this.prisma.company.update({ where: { id }, data: dto });
    await this.audit.write({ actor, entityType: 'company', entityId: id, action: 'update' });
    return company;
  }
}

/**
 * A company is a CUSTOMER'S EMPLOYER, not a tenant — see the model comment in
 * schema.prisma. Renamed from `organizations` on 2026-08-08.
 *
 * WRITES ARE ADMIN-ONLY, AND THAT IS A FIX, NOT A DEFAULT. Until now not one of
 * these four routes carried @Roles at all, so any authenticated member —
 * including an agent — could create and edit companies. The dangerous field is
 * `domain`: CustomersService.findOrCreateByEmail() files every new customer
 * under the company whose domain matches their email address, so an agent who
 * could set `domain` could pull other people's customers into a company of
 * their choosing, and their tickets with them.
 *
 * 'admin' rather than 'lead' because that is what this codebase already does
 * with workspace-wide catalog data: tags (TagsController create/update/delete)
 * and teams (TeamsController create/update/delete) are all @Roles('admin').
 * 'lead' appears on teams only for adding and removing MEMBERS — day-to-day
 * staffing inside a structure an admin defined. Companies are the structure.
 *
 * Reads stay open to any member, deliberately: agents need the company on a
 * ticket to do their job, and the list backs the console's customer filters.
 *
 * No @AllowApiKey/@Scopes anywhere here, also deliberately. RolesGuard treats a
 * route with roles and no scopes as human-only, so a chatbot key cannot reach
 * these at all — see the spec.
 */
@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list() {
    return this.companies.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.get(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CompanyDto, @CurrentUser() principal: Principal) {
    return this.companies.create(dto, principal);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto, @CurrentUser() principal: Principal) {
    return this.companies.update(id, dto, principal);
  }
}

@Module({
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
