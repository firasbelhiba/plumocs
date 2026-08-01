'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export interface SortIconProps {
  /** The field this icon represents */
  field: string;
  /** The currently sorted field */
  currentSortField: string;
  /** The current sort direction */
  sortDirection: 'asc' | 'desc';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Sort indicator for table headers — brand list-sort (two arrows) when
 * inactive, plain chevron-up/down when active.
 */
export const SortIcon: React.FC<SortIconProps> = ({
  field,
  currentSortField,
  sortDirection,
  className,
}) => {
  const isActive = currentSortField === field;

  if (!isActive) {
    return (
      <Icon
        name="list-sort"
        size={16}
        className={cn('text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity', className)}
      />
    );
  }

  return (
    <Icon
      name={sortDirection === 'asc' ? 'state-chevron-up' : 'state-chevron-down'}
      size={16}
      className={cn('text-[color:var(--primary)]', className)}
    />
  );
};

export default SortIcon;
