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
  /**
   * The tenant this request is acting in — the workspace named by the caller
   * (or the only one, while there is only one), resolved by AuthGuard.
   *
   * Required, not optional: every authenticated request happens inside exactly
   * one workspace, and an optional field here would cost every `where` clause in
   * the codebase a non-null assertion, which is precisely where a tenant filter
   * gets quietly dropped.
   */
  workspaceId: string;
  /**
   * For a user: their role ON THIS DESK, read from the workspace_memberships row
   * for `workspaceId`. One human can be an admin of one workspace and an agent
   * on another, so this is never a property of the person.
   */
  role?: Role; // users only
  /**
   * For a user: the team they belong to IN THIS WORKSPACE.
   * For an API key: the team the key is confined to, or null for workspace-wide.
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
