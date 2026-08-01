import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../permissions';
import type { ApiScope } from '../permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as unauthenticated (login, health, inbound email webhook). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Coarse role gate — @Roles('lead') means lead or above (roles are hierarchical). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const SCOPES_KEY = 'scopes';
/** Machine scope gate — skipped for human principals. */
export const Scopes = (...scopes: ApiScope[]) => SetMetadata(SCOPES_KEY, scopes);

export const ALLOW_API_KEY = 'allowApiKey';
/** Routes that machines (API keys) may call at all. Default: humans only. */
export const AllowApiKey = () => SetMetadata(ALLOW_API_KEY, true);

/** The authenticated principal: a user (`kind: 'user'`) or an API key (`kind: 'api_key'`). */
export interface Principal {
  kind: 'user' | 'api_key';
  id: string;
  role?: Role; // users only
  /**
   * For a user: the team they belong to.
   * For an API key: the team the key is confined to, or null for instance-wide.
   * Either way it is the row-level scope — see TeamScopeService.
   */
  teamId?: string | null;
  name?: string;
  scopes?: string[]; // api keys only
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest();
  return req.principal;
});
