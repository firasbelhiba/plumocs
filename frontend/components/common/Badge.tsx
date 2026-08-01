import React, { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-token-sm px-1.5 h-[18px] text-[11px] leading-tight font-medium border',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-fg-2 border-[color:var(--border)]',
        primary:
          'bg-[color:var(--primary-soft)] text-[color:var(--primary)] border-[color:var(--primary-soft-border)]',
        secondary: 'bg-surface-2 text-fg border-[color:var(--border)]',
        success: 'bg-[color:var(--success-soft)] text-[color:var(--success)] border-transparent',
        warning: 'bg-[color:var(--warning-soft)] text-[color:var(--warning)] border-transparent',
        danger: 'bg-[color:var(--danger-soft)] text-[color:var(--danger)] border-transparent',
        outline: 'bg-transparent text-fg border-[color:var(--border-strong)]',
        // Issue type badges — keep API, map to tones
        bug: 'bg-[color:var(--danger-soft)] text-[color:var(--danger)] border-transparent',
        task: 'bg-[color:var(--primary-soft)] text-[color:var(--primary)] border-[color:var(--primary-soft-border)]',
        story: 'bg-[color:var(--success-soft)] text-[color:var(--success)] border-transparent',
        epic: 'bg-[color:var(--epic-soft)] text-[color:var(--epic)] border-[color:var(--epic-soft-border)]',
        subtask: 'bg-surface-2 text-fg-2 border-[color:var(--border)]',
        // Priority
        critical: 'bg-[color:var(--danger)] text-white border-transparent',
        high: 'bg-[color:var(--warning-soft)] text-[color:var(--warning)] border-transparent',
        medium: 'bg-surface-2 text-fg-2 border-[color:var(--border)]',
        low: 'bg-surface-2 text-fg-3 border-[color:var(--border)]',
        // Status
        todo: 'bg-surface-2 text-fg-2 border-[color:var(--border)]',
        in_progress:
          'bg-[color:var(--primary-soft)] text-[color:var(--primary)] border-[color:var(--primary-soft-border)]',
        in_review: 'bg-[color:var(--warning-soft)] text-[color:var(--warning)] border-transparent',
        done: 'bg-[color:var(--success-soft)] text-[color:var(--success)] border-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  children: ReactNode;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ className, variant, dot, children, ...props }) => {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />}
      {children}
    </div>
  );
};
