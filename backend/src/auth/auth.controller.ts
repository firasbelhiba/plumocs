import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser, Principal, Public } from '../common/decorators';
import { WORKSPACE_SLUG_HEADER } from '../common/workspace/workspace-context.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  // These two routes are @Public, so AuthGuard never runs and no principal
  // exists to carry the workspace — they take the slug off the wire themselves.
  login(@Body() dto: LoginDto, @Headers(WORKSPACE_SLUG_HEADER) slug?: string) {
    return this.auth.login(dto.email, dto.password, slug?.trim() || undefined);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  // THE HEADER IS THE POINT OF THIS ROUTE'S SIGNATURE, not decoration.
  //
  // AuthService.refresh re-resolves the membership every time rather than
  // carrying the old one over, so a refresh that names no desk has to be
  // resolved by guessing — and for somebody who belongs to two workspaces the
  // resolver refuses to guess and answers 403. The console reads a failed
  // refresh as session death, so that 403 is a logout every fifteen minutes for
  // exactly the people invitations are about to create.
  //
  // On the header and not a `workspaceSlug` on RefreshDto: naming a tenant is
  // one mechanism across this API (WORKSPACE_SLUG_HEADER), a body field would
  // be a second one to keep in step, and it is the only form login can use —
  // its body is the credential. Public says nothing about tenancy: this route
  // has no bearer token to carry a workspace for it, which is precisely why it
  // has to be told.
  refresh(@Body() dto: RefreshDto, @Headers(WORKSPACE_SLUG_HEADER) slug?: string) {
    return this.auth.refresh(dto.refreshToken, slug?.trim() || undefined);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  me(@CurrentUser() principal: Principal) {
    return this.auth.me(principal);
  }

  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() principal: Principal, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(principal.id, dto.currentPassword, dto.newPassword);
  }
}
