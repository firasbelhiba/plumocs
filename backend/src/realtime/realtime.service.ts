import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * One channel for every tenant, deliberately. Each API replica holds sockets
 * belonging to every workspace, so each replica has to receive every
 * workspace's events — splitting the channel per workspace would buy nothing
 * and cost a dynamic (re)subscribe every time a desk is created.
 *
 * The tenant boundary lives where delivery happens, in the gateway's rooms.
 * What this layer owes the gateway is the workspaceId to scope them by, which
 * is why RealtimeEvent below makes it mandatory rather than optional.
 */
const CHANNEL = 'plumo.realtime';

/**
 * Every realtime event names the tenant it belongs to, and the type insists.
 *
 * Required rather than optional for the same reason `Principal.workspaceId` is
 * required: an optional field is one that gets forgotten at exactly one call
 * site. The gateway drops what it cannot scope, so the price of forgetting is
 * an event that silently never arrives — a compile error is far cheaper.
 * Every publisher runs inside a bound request or a bound job and already has
 * the id to hand.
 */
export type RealtimeEvent = Record<string, unknown> & { workspaceId: string };

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

  publish(event: string, payload: RealtimeEvent) {
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
