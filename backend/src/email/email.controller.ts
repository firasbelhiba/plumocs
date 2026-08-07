import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Put,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { IsEmail, ValidateIf } from 'class-validator';
import { CurrentUser, Principal, Public, Roles } from '../common/decorators';
import { QueueProducer } from '../queue/queue.producer';
import { EmailService, InboundEmailPayload } from './email.service';

/** Constant-time compare over fixed-length digests (inputs may differ in length). */
function secretMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

class SetInboundAddressDto {
  /**
   * An explicit null switches the channel off. Deliberately not @IsOptional:
   * that skips undefined too, so an empty body would silently clear a desk's
   * receiving address and take its email channel down without saying so.
   */
  @ValidateIf((_o, value) => value !== null)
  @IsEmail({ require_tld: false })
  inboundEmail!: string | null;
}

/**
 * Inbound-email webhook (§11, webhook mode). The provider POSTs either the raw
 * MIME message or a pre-parsed payload; the shared secret gates the endpoint.
 * Parsing happens in the worker (email.inbound queue) — enqueue, don't block.
 *
 * ROUTING HAPPENS HERE, BEFORE THE ENQUEUE. The job has to name its workspace
 * (processors refuse to run unbound), and the only field that can say which desk
 * a stranger's email belongs to is the recipient address. Resolving it here also
 * means an unroutable message is refused at the door with a status the provider
 * can act on, instead of being accepted and then dying in the dead-letter set.
 */
@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly config: ConfigService,
    private readonly queue: QueueProducer,
    private readonly email: EmailService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(202)
  @Post('inbound')
  async inbound(
    @Headers('x-inbound-secret') secret: string | undefined,
    @Body() body: InboundEmailPayload,
  ) {
    const expected = this.config.get<string>('inboundEmailWebhookSecret');
    // secretMatches, not `!==`: the helper was already here and unused, so every
    // request was comparing the secret with a short-circuiting string compare.
    if (!secretMatches(secret, expected)) throw new UnauthorizedException('Bad inbound secret');

    const route = await this.email.routeInbound(body);
    if (!route) {
      // 422 rather than 202: the message is REFUSED and the provider must be told
      // so it can bounce or hold it. Accepting mail we then drop is how this
      // feature managed to be dead without anyone noticing. Not 5xx either — an
      // address with no desk behind it is not fixed by retrying in 60 seconds,
      // and routeInbound has already logged which address failed to match.
      throw new UnprocessableEntityException('No workspace receives mail at that address');
    }

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
      route.workspaceId,
    );
    return { accepted: true };
  }

  /**
   * The desk's receiving address — the switch that turns the inbound channel on.
   * Provisioning leaves it NULL, so a new workspace refuses all inbound mail
   * until an admin sets one.
   */
  @Get('inbound-address')
  @Roles('admin')
  getInboundAddress(@CurrentUser() principal: Principal) {
    return this.email.getInboundAddress(principal.workspaceId);
  }

  @Put('inbound-address')
  @Roles('admin')
  setInboundAddress(@Body() dto: SetInboundAddressDto, @CurrentUser() principal: Principal) {
    // principal.workspaceId, never a body field: an admin of desk A must not be
    // able to point desk B's mail at themselves.
    return this.email.setInboundAddress(principal.workspaceId, dto.inboundEmail, principal);
  }
}
