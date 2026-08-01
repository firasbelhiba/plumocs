import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, UnprocessableEntityException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Principal, Roles } from '../common/decorators';
import { API_SCOPES } from '../common/permissions';

class CreateApiKeyDto {
  @IsString() name!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(API_SCOPES as unknown as string[], { each: true })
  scopes!: string[];

  /** Confine the key to one team. Omit only when instance-wide is intended. */
  @IsOptional() @IsUUID() teamId?: string;

  /**
   * Instance-wide keys see every ticket, so they must be asked for explicitly
   * rather than obtained by forgetting `teamId`.
   */
  @IsOptional() @IsBoolean() allowInstanceWide?: boolean;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true, name: true, keyPrefix: true, scopes: true, teamId: true,
        lastUsedAt: true, isActive: true, createdAt: true,
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The secret is generated once, hashed for storage, and returned exactly once.
   *
   * A key without `teamId` can read every ticket in the instance, so it has to
   * be requested deliberately via `allowInstanceWide` — forgetting the team
   * should not silently mint an all-seeing credential.
   */
  async create(dto: CreateApiKeyDto, actor: Principal) {
    if (!dto.teamId && !dto.allowInstanceWide) {
      throw new UnprocessableEntityException({
        code: 'API_KEY_SCOPE_REQUIRED',
        message:
          'Give the key a teamId, or set allowInstanceWide if it really should see every team',
      });
    }
    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: dto.teamId } });
      if (!team) throw new NotFoundException('Team not found');
    }

    const secret = `plumo_sk_${randomBytes(24).toString('hex')}`;
    const key = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        scopes: dto.scopes,
        teamId: dto.teamId ?? null,
        keyPrefix: secret.slice(0, 12),
        keyHash: createHash('sha256').update(secret).digest('hex'),
        createdById: actor.id,
      },
    });
    await this.audit.write({
      actor, entityType: 'api_key', entityId: key.id, action: 'create',
      diff: { scopes: dto.scopes, teamId: key.teamId, instanceWide: !key.teamId },
    });
    return { id: key.id, name: key.name, scopes: key.scopes, teamId: key.teamId, secret, createdAt: key.createdAt };
  }

  async revoke(id: string, actor: Principal) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });
    await this.audit.write({ actor, entityType: 'api_key', entityId: id, action: 'revoke' });
    return { ok: true };
  }
}

@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.keys.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() principal: Principal) {
    return this.keys.create(dto, principal);
  }

  @Delete(':id')
  @Roles('admin')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() principal: Principal) {
    return this.keys.revoke(id, principal);
  }
}

@Module({
  providers: [ApiKeysService],
  controllers: [ApiKeysController],
})
export class ApiKeysModule {}
