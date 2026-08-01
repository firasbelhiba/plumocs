import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  /** Inline style override — useful for callers that need a precise pixel
      height (e.g. matching a chart's height while loading). */
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  style,
}) => {
  return (
    <div
      className={cn(
        'shimmer',
        variant === 'text' && 'h-4 rounded-token-sm',
        variant === 'circular' && 'rounded-full',
        variant === 'rectangular' && 'rounded-token-sm',
        className,
      )}
      style={style}
    ></div>
  );
};

// Skeleton variants for common use cases
export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-surface rounded-token border p-6" style={{ borderColor: 'var(--border)' }}>
      <Skeleton className="h-8 w-3/4 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6 mb-2" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton variant="circular" className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};
