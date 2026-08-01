import { Controller, Get, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

@Injectable()
export class HealthService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.redis = new Redis(config.get<string>('redisUrl')!, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  liveness() {
    return { status: 'ok', at: new Date().toISOString() };
  }

  async readiness() {
    const checks: Record<string, 'ok' | 'fail'> = { database: 'fail', redis: 'fail' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch { /* fail */ }
    try {
      if (this.redis.status === 'wait' || this.redis.status === 'end') await this.redis.connect();
      await this.redis.ping();
      checks.redis = 'ok';
    } catch { /* fail */ }

    if (Object.values(checks).includes('fail')) {
      throw new ServiceUnavailableException({ status: 'not-ready', checks });
    }
    return { status: 'ready', checks };
  }
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('ready')
  readiness() {
    return this.health.readiness();
  }
}

@Module({
  providers: [HealthService],
  controllers: [HealthController],
})
export class HealthModule {}
