import React from 'react';
import { Skeleton } from './Skeleton';

interface AdminListPageSkeletonProps {
  /** Inner padding container class. */
  className?: string;
  /** Render a mono "admin" pill next to the title. */
  withPill?: boolean;
  /** Render a filters card between the header and the list. */
  withFilters?: boolean;
  /** Number of list rows. */
  rows?: number;
}

/** One list row — leading marker + name/desc, trailing meta + action. */
const ListRowSkeleton: React.FC = () => (
  <div
    className="flex items-center justify-between gap-3 px-4 py-3.5 border-b last:border-b-0"
    style={{ borderColor: 'var(--border)' }}
  >
    <div className="flex items-center gap-3 min-w-0">
      <Skeleton variant="circular" className="h-2.5 w-2.5 shrink-0" />
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-2.5 w-56 max-w-full" />
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <Skeleton className="h-4 w-16 rounded-token-sm" />
      <Skeleton className="h-7 w-7 rounded-token-sm" />
    </div>
  </div>
);

/**
 * Shared skeleton for admin list pages (system roles, ticket categories,
 * project member tags). Mirrors the common shape — breadcrumb,
 * header (title + optional admin pill + description + CTA), optional filters,
 * and a list card — so the page keeps its shape while data loads instead of a
 * centered branded loader.
 */
export const AdminListPageSkeleton: React.FC<AdminListPageSkeletonProps> = ({
  className = 'p-8',
  withPill = false,
  withFilters = false,
  rows = 6,
}) => (
  <div className="h-full overflow-auto" aria-hidden="true">
    <div className={className}>
      {/* Breadcrumb */}
      <Skeleton className="h-3.5 w-56 mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-48" />
            {withPill && <Skeleton className="h-4 w-12 rounded-token-sm" />}
          </div>
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-token-sm shrink-0" />
      </div>

      {/* Filters */}
      {withFilters && (
        <div
          className="bg-surface rounded-lg border p-3 mb-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {['w-48', 'w-48', 'w-40'].map((w, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className={`h-8 ${w} rounded-token-sm`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List card */}
      <div
        className="bg-surface rounded-token border overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="px-4 py-3 border-b flex items-center gap-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <Skeleton className="h-4 w-4 rounded-token-sm" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div>
          {Array.from({ length: rows }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default AdminListPageSkeleton;
