/**
 * The permission matrix (§8.3 of the backend doc) as a single policy map —
 * resource → action → rule. Guards and services read this, so the doc and
 * the code share one source of truth.
 *
 * Rules:
 *   'any'        — any authenticated human
 *   'team'       — agent: own team or assigned-to-self; lead: own team; admin: all
 *   'lead-team'  — lead within own team, admin everywhere; agents denied
 *   'admin'      — admin only
 */
export type PermissionRule = 'any' | 'team' | 'lead-team' | 'admin';

export const PERMISSIONS: Record<string, Record<string, PermissionRule>> = {
  tickets: {
    view: 'team',
    create: 'any',
    reply: 'team',
    note: 'team',
    transition: 'team',
    reopen: 'lead-team',
    edit: 'team', // priority / tags / subject
    assign_self: 'team',
    assign_others: 'lead-team',
    move_team: 'lead-team',
    bulk: 'lead-team',
    merge: 'lead-team',
    delete: 'admin',
    export: 'admin',
  },
  customers: {
    view: 'any',
    create: 'any',
    edit: 'any',
    delete: 'admin',
  },
  canned_responses: {
    use: 'any',
    manage_team: 'lead-team',
    manage_global: 'admin',
  },
  tags: {
    apply: 'any',
    manage: 'admin',
  },
  sla: {
    view: 'any',
    manage: 'admin',
  },
  reports: {
    own: 'any',
    team: 'lead-team',
    instance: 'admin',
  },
  users: {
    view: 'any',
    manage: 'admin',
  },
  teams: {
    view: 'any',
    edit_membership: 'lead-team',
    manage: 'admin',
  },
  webhooks: { manage: 'admin' },
  api_keys: { manage: 'admin' },
  email_config: { manage: 'admin' },
  audit: {
    ticket_trail: 'team',
    global: 'admin',
  },
};

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
