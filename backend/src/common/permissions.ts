/**
 * There is no permission matrix here any more, and there should not be one.
 *
 * A `PERMISSIONS` map used to sit at the top of this file — resource → action →
 * rule, with a header claiming guards and services read it. Nothing did. Its
 * only importer was its own spec, which asserted the table against itself and
 * would have stayed green with every @Roles decorator in the codebase deleted.
 * A table that looks like the authorisation model and governs nothing is worse
 * than no table: it is the first thing a reader trusts, and it drifts silently.
 *
 * The real matrix is the @Roles decorators on the controllers, plus the
 * row-level rules in TeamScopeService and the per-field checks in the services
 * (assignment, team moves, reopen). docs/rbac-audit.md walks the whole surface
 * route by route and is the document to read — and to correct — instead.
 *
 * What IS live below: ROLE_ORDER/roleAtLeast, the hierarchy roles.guard.ts
 * imports, and API_SCOPES, which api-keys.module.ts validates key grants
 * against. Both are load-bearing; the file stays for them.
 */

/** Machine scopes (§8.5) — literal grants, no inheritance. */
export const API_SCOPES = [
  'tickets:read',
  'tickets:write',
  'customers:read',
  'customers:write',
  'webhooks:manage',
  'exports:run',
  'reports:read',
  // Chatbot ingest. Deliberately NOT tickets:write — a chatbot should be able to
  // run its own conversations without also being able to reassign, merge or
  // retag anything else on the desk.
  'chat:write',
  'chat:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const ROLE_ORDER = { agent: 0, lead: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_ORDER;

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}
