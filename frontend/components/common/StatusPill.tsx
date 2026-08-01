import React from 'react';
import { WorkflowStatusBehavior } from '@/types/project';

export type StatusKey = 'backlog' | 'todo' | 'progress' | 'review' | 'done' | 'blocked';

export const getStatusKeyForWorkflowBehavior = (behavior: WorkflowStatusBehavior): StatusKey => {
  switch (behavior) {
    case WorkflowStatusBehavior.OPEN:
      return 'todo';
    case WorkflowStatusBehavior.ACTIVE:
      return 'progress';
    case WorkflowStatusBehavior.REVIEW:
      return 'review';
    case WorkflowStatusBehavior.COMPLETED:
      return 'done';
  }
};

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_BG: Record<Tone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'var(--surface-2)', fg: 'var(--text-2)', bd: 'var(--border)' },
  primary: { bg: 'var(--primary-soft)', fg: 'var(--primary)', bd: 'var(--primary-soft-border)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success)', bd: 'transparent' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', bd: 'transparent' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)', bd: 'transparent' },
};

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--text-3)',
  primary: 'var(--primary)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  danger: 'var(--danger)',
};

// Plumo brand status glyphs — 28×28 viewBox, 1.75px stroke. Geometry mirrors
// trash/plumo-brand/10-priority-status/status-*.svg. Colors come from
// --status-* CSS tokens so dark mode flips automatically. The palette here
// intentionally ignores the parent pill's tone (--primary/--success/etc) —
// the brand glyphs carry their own meaning, the pill's tone only colors the
// label + chip surface.
function StatusIcon({ status, size = 14 }: { status: StatusKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 28 28',
    shapeRendering: 'geometricPrecision' as const,
    'aria-hidden': true,
  };
  switch (status) {
    case 'backlog':
      // someday — dotted ring
      return (
        <svg {...common} fill="none">
          <circle
            cx="14"
            cy="14"
            r="9"
            stroke="var(--status-ring-muted)"
            strokeWidth="1.75"
            strokeDasharray="2 2.5"
          />
        </svg>
      );
    case 'todo':
      // ready — empty ring
      return (
        <svg {...common} fill="none">
          <circle cx="14" cy="14" r="9" stroke="var(--status-ring-neutral)" strokeWidth="1.75" />
        </svg>
      );
    case 'progress':
      // in progress — light track + quarter arc
      return (
        <svg {...common} fill="none">
          <circle cx="14" cy="14" r="9" stroke="var(--status-progress-track)" strokeWidth="1.75" />
          <path
            d="M 14 5 A 9 9 0 0 1 23 14"
            stroke="var(--status-progress-arc)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'review':
      // looking — ring with center dot
      return (
        <svg {...common} fill="none">
          <circle cx="14" cy="14" r="9" stroke="var(--status-review)" strokeWidth="1.75" />
          <circle cx="14" cy="14" r="2" fill="var(--status-review)" />
        </svg>
      );
    case 'done':
      // done — filled circle with check
      return (
        <svg {...common}>
          <circle cx="14" cy="14" r="9" fill="var(--status-done-fill)" />
          <path
            d="M 10 14 L 13 17 L 18 11"
            fill="none"
            stroke="var(--status-done-check)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'blocked':
      // resting — peach ring with pause bars
      return (
        <svg {...common} fill="none">
          <circle cx="14" cy="14" r="9" stroke="var(--status-blocked)" strokeWidth="1.75" />
          <line
            x1="11.5"
            y1="11"
            x2="11.5"
            y2="17"
            stroke="var(--status-blocked)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <line
            x1="16.5"
            y1="11"
            x2="16.5"
            y2="17"
            stroke="var(--status-blocked)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

const LABELS: Record<StatusKey, { label: string; tone: Tone }> = {
  backlog: { label: 'Backlog', tone: 'neutral' },
  todo: { label: 'Todo', tone: 'neutral' },
  progress: { label: 'In Progress', tone: 'primary' },
  review: { label: 'In Review', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  blocked: { label: 'Blocked', tone: 'danger' },
};

interface StatusPillProps {
  status: StatusKey;
  label?: string;
  withIcon?: boolean;
  compact?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  label,
  withIcon = true,
  compact = false,
  className,
}) => {
  const base = LABELS[status];
  const s = label ? { ...base, label } : base;
  if (compact) {
    return (
      <span
        className={`inline-flex items-center ${className ?? ''}`}
        style={{ color: TONE_COLOR[s.tone] }}
        title={s.label}
        aria-label={s.label}
      >
        <StatusIcon status={status} size={18} />
      </span>
    );
  }
  const t = TONE_BG[s.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 h-[18px] text-[11px] font-medium rounded-token-sm border ${className ?? ''}`}
      style={{ background: t.bg, color: t.fg, borderColor: t.bd }}
      title={s.label}
    >
      {withIcon && <StatusIcon status={status} />}
      {s.label}
    </span>
  );
};

export default StatusPill;
