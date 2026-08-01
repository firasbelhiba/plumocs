import { Module } from '@nestjs/common';
import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
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

const PUBLIC_USER = {
  id: true, email: true, name: true, role: true, teamId: true,
  isActive: true, availability: true, avatarUrl: true, lastActiveAt: true, createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: PUBLIC_USER,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actor: Principal) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        teamId: dto.teamId ?? null,
        passwordHash: await argon2.hash(dto.password),
      },
      select: PUBLIC_USER,
    });
    await this.audit.write({ actor, entityType: 'user', entityId: user.id, action: 'create', diff: { role: dto.role } });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: Principal) {
    const before = await this.get(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_USER });
    await this.audit.write({ actor, entityType: 'user', entityId: id, action: 'update', diff: { before, after: user } });
    return user;
  }

  /** Deactivate, never hard-delete — replies stay on every ticket. */
  async deactivate(id: string, actor: Principal) {
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: false }, select: PUBLIC_USER });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.write({ actor, entityType: 'user', entityId: id, action: 'deactivate' });
    return user;
  }

  /** Any user may update their own availability/profile basics. */
  async updateSelf(id: string, dto: { availability?: string; name?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.availability ? { availability: dto.availability } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: PUBLIC_USER,
    });
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
  list(@Query('includeInactive') includeInactive?: string) {
    return this.users.list(includeInactive === 'true');
  }

  /** Own profile/availability — any role. Must precede :id routes. */
  @Patch('me')
  updateSelf(@CurrentUser() principal: Principal, @Body() dto: UpdateSelfDto) {
    return this.users.updateSelf(principal.id, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
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
