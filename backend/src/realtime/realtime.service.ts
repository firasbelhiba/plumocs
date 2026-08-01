import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const CHANNEL = 'plumo.realtime';

/**
 * Fan-out across API replicas via Redis pub/sub (§14). The gateway subscribes
 * and re-emits to connected sockets; publishers just call publish().
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly pub: Redis;
  private sub: Redis | null = null;

  constructor(config: ConfigService) {
    const url = config.get<string>('redisUrl')!;
    this.pub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this.pub.on('error', (e) => this.logger.warn(`redis pub: ${e.message}`));
  }

  publish(event: string, payload: Record<string, unknown>) {
    this.pub
      .publish(CHANNEL, JSON.stringify({ event, payload, at: Date.now() }))
      .catch((e) => this.logger.warn(`publish failed: ${e.message}`));
  }

  /** The gateway calls this once to receive every published event. */
  subscribe(handler: (event: string, payload: Record<string, unknown>) => void) {
    if (this.sub) return;
    this.sub = this.pub.duplicate();
    this.sub.on('error', (e) => this.logger.warn(`redis sub: ${e.message}`));
    this.sub.subscribe(CHANNEL).catch((e) => this.logger.warn(`subscribe failed: ${e.message}`));
    this.sub.on('message', (_channel, raw) => {
      try {
        const { event, payload } = JSON.parse(raw);
        handler(event, payload);
      } catch {
        /* malformed message — ignore */
      }
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.pub.quit(), this.sub?.quit()]);
  }
}
