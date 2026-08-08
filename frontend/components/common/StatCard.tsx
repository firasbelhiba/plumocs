'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

interface StatCardProps {
  label: string;
  /** A node, not just a scalar, so a caller whose number has not arrived can
      pass a `Skeleton` rather than a placeholder zero. */
  value: ReactNode;
  icon?: ReactNode;
  colorClass?: string;
  /** @deprecated — colored icon tile is no longer rendered (kept for API compat) */
  bgClass?: string;
  /** Legacy up/down arrow chip */
  trend?: {
    direction: 'up' | 'down';
    value: string;
  };
  /** Optional inline "+3"/"-2" delta string */
  delta?: string;
  /** Optional sparkline series */
  sparkline?: number[];
  /** When true, sparkline exposes hover dots + tooltip */
  sparklineInteractive?: boolean;
  /** Optional formatter for the sparkline tooltip value */
  sparklineFormatLabel?: (value: number, index: number, total: number) => string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  colorClass = 'text-fg',
  trend,
  delta,
  sparkline,
  sparklineInteractive = false,
  sparklineFormatLabel,
  className,
}) => {
  const deltaColor = delta
    ? delta.startsWith('-')
      ? 'var(--danger)'
      : 'var(--success)'
    : undefined;

  return (
    <div
      className={cn(
        'bg-surface rounded-token border shadow-card p-4 transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-[cubic-bezier(0.2,0,0,1)] hover:shadow-card-hover hover:-translate-y-0.5',
        className,
      )}
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Top row — uppercase label + small muted icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium text-fg-2 uppercase tracking-wider leading-tight">
          {label}
        </div>
        {icon && <span className="text-fg-3 shrink-0">{icon}</span>}
      </div>

      {/* Value + delta */}
      <div className="mt-2 flex items-baseline gap-2">
        <div className={cn('font-mono text-2xl font-semibold tracking-tight', colorClass)}>
          {value}
        </div>
        {delta && (
          <span className="text-[11px] font-mono font-medium" style={{ color: deltaColor }}>
            {delta}
          </span>
        )}
        {trend && !delta && (
          <span
            className={cn(
              'text-[11px] font-medium',
              trend.direction === 'up'
                ? 'text-[color:var(--success)]'
                : 'text-[color:var(--danger)]',
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 0 && (
        <div className="mt-2 w-full">
          <Sparkline
            data={sparkline}
            width={200}
            height={28}
            className="w-full"
            fill
            interactive={sparklineInteractive}
            formatLabel={sparklineFormatLabel}
          />
        </div>
      )}
    </div>
  );
};

export default StatCard;
