import { invitationState, invitationStatus, refusalFor, InvitationState } from './invitation-state';

/**
 * The state machine, tested on its own.
 *
 * This is the rule that decides whether a stranger holding a link gets onto a
 * customer's desk. Everything around it — the SECURITY DEFINER lookup, the
 * transaction, the membership write — is plumbing that can be exercised with
 * mocks; this cannot be got wrong quietly, so it is pure and it is tested
 * directly.
 *
 * The cases that matter are the OVERLAPS. A single-predicate implementation
 * passes "fresh" and "expired" and still tells an admin who revoked an
 * invitation in March that it expired in May.
 */
describe('invitationState', () => {
  const NOW = new Date('2026-08-07T12:00:00Z');
  const LATER = new Date('2026-08-14T12:00:00Z');
  const EARLIER = new Date('2026-08-01T12:00:00Z');

  const fresh = {
    workspaceActive: true,
    expiresAt: LATER,
    acceptedAt: null as Date | null,
    revokedAt: null as Date | null,
  };

  it('is valid while it is live, unused and its desk is open', () => {
    expect(invitationState(fresh, NOW)).toBe('valid');
  });

  it('expires', () => {
    expect(invitationState({ ...fresh, expiresAt: EARLIER }, NOW)).toBe('expired');
  });

  it('treats the expiry instant itself as expired', () => {
    // The boundary is arbitrary but it has to be decided somewhere, and
    // "expired at its expiry" is the reading a human would give it.
    expect(invitationState({ ...fresh, expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('reports accepted, not expired, once it has been used', () => {
    // Every accepted invitation eventually passes its expiry. Reporting that as
    // "expired" tells somebody to ask for a new link when what they need is to
    // sign in.
    expect(
      invitationState({ ...fresh, expiresAt: EARLIER, acceptedAt: EARLIER }, NOW),
    ).toBe('accepted');
  });

  it('reports revoked, not expired — a decision outranks the calendar', () => {
    expect(
      invitationState({ ...fresh, expiresAt: EARLIER, revokedAt: EARLIER }, NOW),
    ).toBe('revoked');
  });

  it('reports a suspended desk ahead of everything else', () => {
    // Not cosmetic: app_set_workspace RAISES on a workspace that is not active,
    // so the caller has to learn this before it tries to bind. A perfectly valid
    // invitation to a suspended desk must not be reported as valid.
    expect(invitationState({ ...fresh, workspaceActive: false }, NOW)).toBe('workspace_inactive');
    expect(
      invitationState({ ...fresh, workspaceActive: false, acceptedAt: EARLIER }, NOW),
    ).toBe('workspace_inactive');
  });
});

describe('invitationStatus', () => {
  const NOW = new Date('2026-08-07T12:00:00Z');

  it('calls a live invitation pending, which is what an admin expects to read', () => {
    expect(
      invitationStatus({ expiresAt: new Date('2026-08-14T12:00:00Z'), acceptedAt: null, revokedAt: null }, NOW),
    ).toBe('pending');
  });

  it('passes the terminal states through unchanged', () => {
    const past = new Date('2026-08-01T12:00:00Z');
    expect(invitationStatus({ expiresAt: past, acceptedAt: null, revokedAt: null }, NOW)).toBe('expired');
    expect(invitationStatus({ expiresAt: past, acceptedAt: past, revokedAt: null }, NOW)).toBe('accepted');
    expect(invitationStatus({ expiresAt: past, acceptedAt: null, revokedAt: past }, NOW)).toBe('revoked');
  });
});

describe('refusalFor', () => {
  const EXPIRY = new Date('2026-08-01T12:00:00Z');
  const REFUSALS: InvitationState[] = ['workspace_inactive', 'accepted', 'revoked', 'expired'];

  it('says nothing about a valid invitation', () => {
    expect(refusalFor('valid', 'Northwind', EXPIRY)).toBeNull();
  });

  it('gives every refusal its own message', () => {
    // THE POINT OF THE WHOLE FILE. One generic "invalid or expired link" is what
    // turns each of these into a support ticket: the reader cannot tell whether
    // to wait, to re-check the URL, or to ask somebody for something, so they ask
    // for all three.
    const messages = REFUSALS.map((s) => refusalFor(s, 'Northwind', EXPIRY));
    expect(new Set(messages).size).toBe(REFUSALS.length);
    for (const m of messages) expect(m).toBeTruthy();
  });

  it('names the workspace where the reader has to go and ask', () => {
    expect(refusalFor('revoked', 'Northwind', EXPIRY)).toContain('Northwind');
    expect(refusalFor('workspace_inactive', 'Northwind', EXPIRY)).toContain('Northwind');
  });

  it('tells an expired link WHEN it expired, not merely that it did', () => {
    expect(refusalFor('expired', 'Northwind', EXPIRY)).toContain('2026-08-01');
  });

  it('sends an already-accepted invitation to sign-in rather than to an admin', () => {
    expect(refusalFor('accepted', 'Northwind', EXPIRY)).toMatch(/sign in/i);
  });
});
