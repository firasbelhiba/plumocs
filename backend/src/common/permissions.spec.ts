import { API_SCOPES, PERMISSIONS, roleAtLeast, ROLE_ORDER, type Role } from './permissions';

/**
 * The policy map is the single source of truth the doc and the guards share
 * (§8.3). These tests pin the rules the matrix calls out explicitly, so a
 * careless edit to the map fails here rather than in production.
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

  describe('matrix invariants from the spec', () => {
    it('deletion and export are admin-only', () => {
      expect(PERMISSIONS.tickets.delete).toBe('admin');
      expect(PERMISSIONS.tickets.export).toBe('admin');
      expect(PERMISSIONS.customers.delete).toBe('admin');
    });

    it('agents cannot reassign others, but can self-assign', () => {
      expect(PERMISSIONS.tickets.assign_others).toBe('lead-team');
      expect(PERMISSIONS.tickets.assign_self).toBe('team');
    });

    it('reopening, bulk actions, merging and team moves need a lead', () => {
      for (const action of ['reopen', 'bulk', 'merge', 'move_team'] as const) {
        expect(PERMISSIONS.tickets[action]).toBe('lead-team');
      }
    });

    it('instance config is admin-only', () => {
      expect(PERMISSIONS.webhooks.manage).toBe('admin');
      expect(PERMISSIONS.api_keys.manage).toBe('admin');
      expect(PERMISSIONS.email_config.manage).toBe('admin');
      expect(PERMISSIONS.tags.manage).toBe('admin');
      expect(PERMISSIONS.sla.manage).toBe('admin');
      expect(PERMISSIONS.users.manage).toBe('admin');
    });

    it('reports widen by role: own → team → instance', () => {
      expect(PERMISSIONS.reports.own).toBe('any');
      expect(PERMISSIONS.reports.team).toBe('lead-team');
      expect(PERMISSIONS.reports.instance).toBe('admin');
    });

    it('global audit search is admin-only, per-ticket trails are not', () => {
      expect(PERMISSIONS.audit.global).toBe('admin');
      expect(PERMISSIONS.audit.ticket_trail).toBe('team');
    });

    it('every rule is one of the four known kinds', () => {
      const valid = new Set(['any', 'team', 'lead-team', 'admin']);
      for (const [resource, actions] of Object.entries(PERMISSIONS)) {
        for (const [action, rule] of Object.entries(actions)) {
          expect({ resource, action, rule }).toMatchObject({ rule: expect.any(String) });
          expect(valid.has(rule)).toBe(true);
        }
      }
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
  });
});
