import { API_SCOPES, roleAtLeast, ROLE_ORDER, type Role } from './permissions';

/**
 * Covers the two things in this file that something else actually imports:
 * the role hierarchy roles.guard.ts ranks callers with, and the scope list
 * api-keys.module.ts validates key grants against.
 *
 * The block that used to sit below these — a page of
 * `expect(PERMISSIONS.x.y).toBe('admin')` — was deleted with the map it
 * described. It asserted a table against itself and passed no matter what the
 * API allowed, so it reported the model was intact while two API-key bypasses
 * lived in tickets.service.ts. Authorisation is tested where it is enforced:
 * tickets.service.spec.ts, roles.guard.spec.ts, team-scope.integration.spec.ts.
 */
describe('permissions policy', () => {
  describe('roleAtLeast', () => {
    it('is reflexive', () => {
      for (const r of Object.keys(ROLE_ORDER) as Role[]) expect(roleAtLeast(r, r)).toBe(true);
    });

    it('ranks agent < lead < admin', () => {
      expect(roleAtLeast('lead', 'agent')).toBe(true);
      expect(roleAtLeast('admin', 'lead')).toBe(true);
      expect(roleAtLeast('admin', 'agent')).toBe(true);
    });

    it('does not promote downward', () => {
      expect(roleAtLeast('agent', 'lead')).toBe(false);
      expect(roleAtLeast('agent', 'admin')).toBe(false);
      expect(roleAtLeast('lead', 'admin')).toBe(false);
    });
  });

  describe('api scopes', () => {
    it('grants nothing over users, teams, roles or keys — human-admin only by construction', () => {
      for (const forbidden of ['users', 'teams', 'roles', 'api_keys', 'sla']) {
        expect(API_SCOPES.some((s) => s.startsWith(`${forbidden}:`))).toBe(false);
      }
    });

    it('uses the documented resource:action shape', () => {
      for (const scope of API_SCOPES) expect(scope).toMatch(/^[a-z]+:[a-z]+$/);
    });

    it('names no lead-only ticket action — reopen, merge and bulk have no machine grant', () => {
      // TicketsService refuses a key the reopen on exactly this basis: scopes
      // are literal and never inherit, so `tickets:write` — the everyday
      // reply-and-retag grant — cannot be read as standing in for a lead.
      for (const action of ['reopen', 'merge', 'bulk', 'move']) {
        expect(API_SCOPES.some((s) => s.endsWith(`:${action}`))).toBe(false);
      }
    });
  });
});
