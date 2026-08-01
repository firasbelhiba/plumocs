/** Queue names (§10) — producers live in the API, processors in the worker. */
export const QUEUES = {
  EMAIL_OUTBOUND: 'email.outbound',
  EMAIL_INBOUND: 'email.inbound',
  WEBHOOK_DELIVER: 'webhook.deliver',
  SLA_SWEEP: 'sla.sweep',
  SEARCH_INDEX: 'search.index',
  EXPORT_DAILY: 'export.daily',
  NOTIFICATIONS_FANOUT: 'notifications.fanout',
} as const;

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};
