import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

interface SettingsFormSkeletonProps {
  /** Number of section cards to render. */
  sections?: number;
  /** Container class. Defaults to the narrow settings column. */
  className?: string;
  /** Render a breadcrumb line above the header. */
  withBreadcrumb?: boolean;
  /** Render an underline tab strip below the header. */
  withTabs?: boolean;
  /** Render a right-aligned button in the header (e.g. "Back to project"). */
  headerButton?: boolean;
}

/** One settings section card — title + subtitle + labeled field rows. */
const SectionCardSkeleton: React.FC = () => (
  <div
    className="bg-surface rounded-token border p-4 md:p-5"
    style={{ borderColor: 'var(--border)' }}
  >
    <Skeleton className="h-4 w-40 mb-1.5" />
    <Skeleton className="h-3 w-64 max-w-full mb-5" />
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-token-sm" />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Shared skeleton for settings form pages. Mirrors the common shape — optional
 * breadcrumb, header (title + subtitle, optional action button), optional tab
 * strip, then a stack of section cards with labeled field rows — so the page
 * keeps its shape while data loads instead of a centered branded loader.
 */
export const SettingsFormSkeleton: React.FC<SettingsFormSkeletonProps> = ({
  sections = 3,
  className = 'max-w-[720px] mx-auto',
  withBreadcrumb = false,
  withTabs = false,
  headerButton = false,
}) => (
  <div className={cn(className)} aria-hidden="true">
    {withBreadcrumb && <Skeleton className="h-3.5 w-56 mb-6" />}

    {/* Header */}
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      {headerButton && <Skeleton className="h-8 w-28 rounded-token-sm shrink-0" />}
    </div>

    {/* Tabs */}
    {withTabs && (
      <div className="border-b mb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-6 pb-2.5 pt-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    )}

    {/* Section cards */}
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, i) => (
        <SectionCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

export default SettingsFormSkeleton;
