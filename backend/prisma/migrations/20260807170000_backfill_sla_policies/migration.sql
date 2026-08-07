-- Give every workspace an SLA policy per priority.
--
-- THE PRODUCTION DESK HAS NONE. `dar-blockchain` — 104 audit rows, every real
-- ticket on the instance — has zero rows in sla_policies, and the consequence is
-- invisible rather than loud: SlaService.policyForPriority finds no match and
-- returns a null due date, so first_response_due_at and resolution_due_at are
-- never stamped. The breach sweep selects on `firstResponseDueAt <= soon`, which
-- NULL never satisfies, so nothing is ever found late. No breach tags, no lead
-- notifications, no sla.breached webhooks, and a "breaching" view that is
-- permanently empty — which reads exactly like a desk that is keeping up.
--
-- A desk auto-provisioned by signing in with Plumo already gets these four rows
-- (auth.service.ts, createDesk). This brings the older desks up to the same
-- standard, and covers any workspace that acquires none by another route.
--
-- Data, not schema, in a migration file on purpose: it must reach production
-- through the same reviewed, backed-up path as everything else, and it must run
-- exactly once per workspace. The NOT EXISTS guard makes re-running harmless.
--
-- business_hours_id stays NULL for every row. These are calendar-time clocks.
-- Attaching business hours means asserting a timezone and a working week for an
-- organisation we know nothing about, and a wrong calendar makes every due date
-- confidently incorrect — worse than an honest 24/7 clock the owner can adjust.
INSERT INTO sla_policies (workspace_id, name, priority, first_response_mins, resolution_mins)
SELECT w.id, v.name, v.priority::ticket_priority, v.first_response, v.resolution
FROM workspaces w
CROSS JOIN (
  VALUES
    ('Standard', 'low',     240, 1440),
    ('Standard', 'normal',  240, 1440),
    ('Priority', 'high',     60,  480),
    ('Urgent',   'urgent',   15,  240)
) AS v(name, priority, first_response, resolution)
WHERE NOT EXISTS (
  -- Per (workspace, priority), not per workspace: a desk that has configured
  -- SOME priorities keeps them and gains only the ones it is missing. Matching
  -- on is_active too, so a deliberately disabled policy is treated as a gap
  -- rather than silently leaving that priority without a clock.
  SELECT 1
  FROM sla_policies s
  WHERE s.workspace_id = w.id
    AND s.priority = v.priority::ticket_priority
    AND s.is_active
);
