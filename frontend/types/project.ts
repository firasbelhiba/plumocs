/**
 * Minimal slice of the project-management type surface that the shared
 * design-system components reference, copied so `StatusPill` compiles
 * unchanged. The support console maps its own ticket statuses onto these
 * behaviours where it needs them.
 */
export enum WorkflowStatusBehavior {
  OPEN = 'open',
  ACTIVE = 'active',
  REVIEW = 'review',
  COMPLETED = 'completed',
}
