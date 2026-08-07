import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Principal, Public, Roles } from '../common/decorators';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitations.dto';

/**
 * Two halves of one feature with opposite security postures.
 *
 * The admin half is workspace-bound and admin-only: the caller is authenticated,
 * AuthGuard has resolved their membership, and WorkspaceBindingInterceptor has
 * opened a transaction bound to their desk, so every query underneath is
 * confined by the workspace_isolation policy.
 *
 * The token half is @Public and therefore UNBOUND — no principal, no
 * transaction, no workspace. It reads the invitation through
 * app_resolve_invitation (SECURITY DEFINER) and binds the workspace itself once
 * it knows which one. See InvitationsService.resolveToken.
 *
 * NO @AllowApiKey ANYWHERE. Creating members is not something a partner's
 * chatbot credential should be able to do, and the default is humans only.
 */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateInvitationDto, @CurrentUser() actor: Principal) {
    return this.invitations.create(dto, actor);
  }

  @Get()
  @Roles('admin')
  list(@CurrentUser() actor: Principal) {
    return this.invitations.list(actor);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: Principal) {
    await this.invitations.revoke(id, actor);
  }

  /**
   * Declared BEFORE nothing in particular, but note the literal 'token' segment:
   * it cannot collide with @Delete(':id') (different method) and the accept POST
   * is one segment deeper, so no route here shadows another.
   *
   * Throttled harder than the authenticated routes because it is the one place
   * an anonymous caller can probe for a valid token. 64 hex characters is 2^256
   * of space, so this is about noise rather than brute force — but a public
   * endpoint that reads the database on every call gets a limit regardless.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token')
  lookup(@Param('token') token: string) {
    return this.invitations.lookup(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('token/:token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    // 200 rather than 201: the response is a session, which is what /auth/login
    // answers 200 with. The console treats the two identically and a 201 here
    // would be the only reason it could not.
    return this.invitations.accept(token, dto ?? {});
  }
}
