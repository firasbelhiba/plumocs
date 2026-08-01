'use client';

import React, { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost';
}

// Preset illustration types for common empty states
type IllustrationType =
  | 'no-data'
  | 'no-results'
  | 'no-items'
  | 'error'
  | 'success'
  | 'inbox'
  | 'folder'
  | 'search'
  | 'create'
  | 'archive'
  | 'no-permissions';

// Brand blob illustrations from /public/brand/empty-states. Rendered at
// full size (no wrapper chip) because they're tuned to read at 200–360px.
// Anything else in the illustrations map below is a small line icon that
// still uses the chip wrapper.
const BRAND_ILLUSTRATIONS: Partial<Record<IllustrationType, { src: string; alt: string }>> = {
  'no-results': { src: '/brand/empty-states/plumo-no-results.svg', alt: 'No results' },
  'no-permissions': {
    src: '/brand/empty-states/plumo-no-permissions.svg',
    alt: 'No permissions',
  },
};

interface EmptyStateProps {
  icon?: string | ReactNode;
  /** Use a preset illustration instead of custom icon */
  illustration?: IllustrationType;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  /** Compact mode for smaller containers */
  compact?: boolean;
}

// SVG illustrations for different empty state types
const illustrations: Record<IllustrationType, ReactNode> = {
  'no-data': (
    <svg className="w-5 h-5 text-fg-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  ),
  // Both 'no-results' and 'no-permissions' are handled via BRAND_ILLUSTRATIONS
  // above — these placeholders only exist so the Record type stays exhaustive.
  'no-results': null,
  'no-permissions': null,
  'no-items': (
    <svg className="w-5 h-5 text-fg-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  // Brand spec: replace red/green outline icons with the multi-color
  // critical octagon (peach + navy/white) and a check inside a soft chip.
  error: <Icon name="state-critical" size={28} />,
  success: <Icon name="state-check" size={20} className="text-[color:var(--success)]" />,
  inbox: (
    <svg className="w-5 h-5 text-fg-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  folder: <Icon name="workspace-folder" size={20} className="text-fg-3" />,
  search: (
    <svg className="w-5 h-5 text-fg-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  create: (
    <svg className="w-5 h-5 text-fg-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
      />
    </svg>
  ),
  archive: <Icon name="workspace-archive" size={20} className="text-fg-3" />,
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  illustration,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  compact = false,
}) => {
  const renderIcon = () => {
    // Brand blob illustration — render full size, no chip wrapper.
    if (illustration && BRAND_ILLUSTRATIONS[illustration]) {
      const brand = BRAND_ILLUSTRATIONS[illustration]!;
      return (
        <div className="flex justify-center mb-4">
          <img
            src={brand.src}
            alt={brand.alt}
            width={compact ? 200 : 280}
            height={compact ? 134 : 187}
            className="max-w-full h-auto"
          />
        </div>
      );
    }

    // Legacy line-icon preset — small chip wrapper.
    if (illustration && illustrations[illustration]) {
      return (
        <div
          className={`inline-flex items-center justify-center ${compact ? 'w-10 h-10' : 'w-12 h-12'} bg-surface-2 text-fg-3 rounded-token border mb-3`}
          style={{ borderColor: 'var(--border-strong)' }}
        >
          {illustrations[illustration]}
        </div>
      );
    }

    // Custom icon
    if (!icon) return null;
    if (typeof icon === 'string') {
      return <div className={`${compact ? 'text-3xl mb-3' : 'text-5xl mb-4'}`}>{icon}</div>;
    }
    return <div className={`${compact ? 'mb-3' : 'mb-4'} text-fg-3`}>{icon}</div>;
  };

  return (
    <div
      className={`bg-surface rounded-token border ${compact ? 'p-6' : 'p-10'} text-center ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {renderIcon()}
      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-fg mb-1`}>{title}</h3>
      {description && (
        <p className={`text-fg-2 ${compact ? 'mb-4 text-xs' : 'mb-6 text-sm'} max-w-md mx-auto`}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center justify-center gap-2">
          {action && (
            <Button
              variant={action.variant || 'primary'}
              onClick={action.onClick}
              size={compact ? 'sm' : 'md'}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'outline'}
              onClick={secondaryAction.onClick}
              size={compact ? 'sm' : 'md'}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
