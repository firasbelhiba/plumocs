import React, { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Support-console extension to the shared design system.
 *
 * `Badge` covers the generic tones both pillars share. Ticket status, priority,
 * SLA state and tags are support-specific semantics with their own palette,
 * which lives in `[data-tone]` custom properties in globals.css. This pill
 * borrows Badge's exact geometry so the two read as one family, but takes its
 * colour from the tone attribute instead of a variant class.
 */
const tonePillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-token-sm font-medium leading-tight border border-transparent w-fit whitespace-nowrap',
  {
    variants: {
      size: {
        sm: 'h-[18px] px-1.5 text-[11px]',
        md: 'h-[22px] px-2 text-[12px]',
        lg: 'h-[26px] px-2.5 text-[12.5px]',
      },
      /** Solid reads stronger — used for the urgent priority chip. */
      solid: { true: '', false: '' },
    },
    defaultVariants: { size: 'sm', solid: false },
  },
);

export interface TonePillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tonePillVariants> {
  /** A `[data-tone]` key: st-open, pr-urgent, sla-breach, tag-billing, … */
  tone?: string;
  /** Leading dot in the tone's hue. */
  dot?: boolean;
  /** Glyph rendered before the label (priority arrows, channel marks). */
  glyph?: ReactNode;
  children: ReactNode;
}

export const TonePill: React.FC<TonePillProps> = ({
  className,
  tone,
  size,
  solid,
  dot,
  glyph,
  children,
  ...props
}) => (
  <span
    data-tone={tone}
    className={cn(tonePillVariants({ size, solid }), className)}
    style={{
      background: solid
        ? 'var(--tone-hue)'
        : 'color-mix(in srgb, var(--tone-hue) 14%, var(--surface))',
      color: solid ? 'var(--surface)' : 'var(--tone-fg)',
    }}
    {...props}
  >
    {dot && (
      <i
        className="w-1.5 h-1.5 rounded-full flex-none"
        style={{ background: solid ? 'currentColor' : 'var(--tone-hue)' }}
      />
    )}
    {glyph}
    {children}
  </span>
);
