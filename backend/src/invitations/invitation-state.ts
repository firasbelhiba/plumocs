/**
 * The invitation state machine, as a pure function.
 *
 * Pure and in its own file because it is the thing that decides whether a
 * stranger gets onto a customer's desk, and that decision has to be testable
 * without a database, a transaction or a mocked Prisma client. Everything
 * around it — the SECURITY DEFINER lookup, the binding, the membership write —
 * is plumbing; this is the rule.
 *
 * ORDER IS THE DESIGN. A row can satisfy several of these predicates at once (an
 * invitation revoked in March is also expired by May), and the state reported is
 * the one whose message is most useful to the person reading it:
 *
 *   1. workspace_inactive — nothing about the invitation matters if the desk is
 *      suspended. "Ask your administrator" is a different errand from "ask for a
 *      new link", and app_set_workspace would raise anyway.
 *   2. accepted  — the seat exists. Tell them to sign in, not to ask again.
 *   3. revoked   — somebody deliberately withdrew it. Deliberate beats elapsed:
 *      an admin who revoked an invitation last month and is asked "why did it
 *      expire?" gets a misleading answer.
 *   4. expired   — the only one that is nobody's decision.
 *   5. valid.
 */
export type InvitationState =
  | 'valid'
  | 'workspace_inactive'
  | 'accepted'
  | 'revoked'
  | 'expired';

/** The subset of a resolved invitation the state machine reads. */
export interface InvitationStateInput {
  workspaceActive: boolean;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export function invitationState(row: InvitationStateInput, now: Date = new Date()): InvitationState {
  if (!row.workspaceActive) return 'workspace_inactive';
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  // `<=` rather than `<`: an invitation whose expiry is exactly now has run out.
  // The boundary is arbitrary but it must be decided somewhere, and "expired at
  // its expiry" is the reading a human would give it.
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

/**
 * What the Settings list shows against each row.
 *
 * Distinct from InvitationState because the list is a report about the desk
 * rather than a decision about one link: workspace_inactive cannot appear (the
 * caller is signed in to that workspace, so it is active by construction), and
 * 'pending' is the name an admin expects for a live one — 'valid' reads like an
 * assertion about the token.
 */
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export function invitationStatus(
  row: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): InvitationStatus {
  const state = invitationState({ ...row, workspaceActive: true }, now);
  return state === 'valid' ? 'pending' : (state as InvitationStatus);
}

/**
 * The sentence the invitee is shown for a state that refuses them.
 *
 * One message per state, and each one names the next action. A single generic
 * "invalid or expired" is what makes a support ticket out of every one of these:
 * the invitee cannot tell whether to wait, to re-check the link, or to ask
 * somebody for something, so they ask for all three.
 *
 * `null` for 'valid' — there is nothing to say.
 */
export function refusalFor(state: InvitationState, workspaceName: string, expiresAt: Date): string | null {
  switch (state) {
    case 'valid':
      return null;
    case 'workspace_inactive':
      return `${workspaceName} is not currently available. Contact your administrator.`;
    case 'accepted':
      return 'This invitation has already been used. Sign in with your email address instead — or use "forgot password" if you do not have one yet.';
    case 'revoked':
      return `This invitation to ${workspaceName} was withdrawn. Ask an admin there to send a new one.`;
    case 'expired':
      return `This invitation expired on ${expiresAt.toISOString().slice(0, 10)}. Ask an admin at ${workspaceName} to send a new one — invitations are good for 7 days.`;
  }
}
