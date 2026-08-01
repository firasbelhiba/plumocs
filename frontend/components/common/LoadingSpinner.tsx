import React from 'react';
import { cn } from '@/lib/utils';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const px = {
  sm: 16,
  md: 32,
  lg: 48,
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className }) => {
  const s = px[size];
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 20 20"
      className={cn('animate-spin text-[color:var(--primary)]', className)}
      aria-label="Loading"
      role="status"
    >
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M10 3a7 7 0 0 1 7 7"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
};
