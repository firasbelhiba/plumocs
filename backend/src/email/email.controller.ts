import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { Public } from '../common/decorators';
import { QueueProducer } from '../queue/queue.producer';

/** Constant-time compare over fixed-length digests (inputs may differ in length). */
function secretMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Inbound-email webhook (§11, webhook mode). The provider POSTs either the raw
 * MIME message or a pre-parsed payload; the shared secret gates the endpoint.
 * Parsing happens in the worker (email.inbound queue) — enqueue, don't block.
 */
@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: QueueProducer,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(202)
  @Post('inbound')
  async inbound(
    @Headers('x-inbound-secret') secret: string | undefined,
    @Body() body: { raw?: string; from?: string; name?: string; subject?: string; text?: string; messageId?: string; inReplyTo?: string },
  ) {
    const expected = this.config.get<string>('inboundEmailWebhookSecret');
    if (!expected || secret !== expected) throw new UnauthorizedException('Bad inbound secret');

    await this.queue.parseInboundEmail(
      body.raw
        ? { raw: body.raw }
        : {
            parsed: {
              from: body.from,
              name: body.name,
              subject: body.subject,
              text: body.text,
              messageId: body.messageId,
              inReplyTo: body.inReplyTo,
            },
          },
    );
    return { accepted: true };
  }
}
