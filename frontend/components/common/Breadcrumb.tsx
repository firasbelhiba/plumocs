import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

// Default home icon — used automatically for "Home" or "Dashboard" labels.
// `workspace-building` is the brand stand-in for "your workspace" since the
// brand set has no literal house icon (per the brand README).
const HomeIcon = <Icon name="workspace-building" size={16} />;

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  /** Set to false to disable auto home icon for Home/Dashboard labels */
  showHomeIcon?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  return (
    <nav className={cn('flex items-center space-x-2 text-sm', className)} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          // Auto-add home icon for first item if label is "Home" or "Dashboard"
          const isHomeItem =
            index === 0 &&
            (item.label === 'Home' || item.label === 'Dashboard') &&
            item.showHomeIcon !== false;
          const icon = item.icon ?? (isHomeItem ? HomeIcon : undefined);

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <Icon name="state-chevron-right" size={16} className="mx-2 text-fg-3" />
              )}

              {isLast || !item.href ? (
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-medium',
                    isLast ? 'text-fg-2' : 'text-fg-3',
                  )}
                >
                  {icon}
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 text-fg-2 hover:text-[color:var(--primary-hover)] dark:hover:text-[color:var(--primary)] transition-colors font-medium"
                >
                  {icon}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
