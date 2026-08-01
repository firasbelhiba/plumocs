import { UnprocessableEntityException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

/**
 * The ticket state machine (§9) — enforced in the service, not the controller.
 *
 *   new ──▶ open ──▶ pending ──▶ open ──▶ resolved ──▶ closed
 *            │         │                     ▲   │
 *            └──▶ on_hold ──▶ open           └───┘ (reopened)
 */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ['open', 'pending', 'on_hold', 'resolved', 'closed'],
  open: ['pending', 'on_hold', 'resolved', 'closed'],
  pending: ['open', 'on_hold', 'resolved', 'closed'],
  on_hold: ['open', 'pending', 'resolved', 'closed'],
  resolved: ['open', 'closed'], // reopen or close
  closed: ['open'], // reopen only
};

/** Transitions that count as a reopen (lead/admin only, per the matrix). */
export function isReopen(from: TicketStatus, to: TicketStatus): boolean {
  return (from === 'resolved' || from === 'closed') && to === 'open';
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) return; // no-op transitions are allowed
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityException({
      code: 'TICKET_INVALID_TRANSITION',
      message: `Cannot move a ${from.replace('_', '-')} ticket to ${to.replace('_', '-')}`,
    });
  }
}

export const TICKET_TRANSITIONS = TRANSITIONS;
