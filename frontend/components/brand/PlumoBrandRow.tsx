import React from 'react';

interface PlumoBrandRowProps {
  /** Approximate logo height in px. */
  size?: number;
  className?: string;
}

/**
 * Brand lockup used at the top of auth screens (login, signup, workspaces,
 * forgot-password, reset-password, authorize). Renders the full plumo
 * lockup (blob mark + lowercase "plumo" wordmark) as a single SVG.
 *
 * Two assets are shipped: a dark version for light themes and a white
 * version for dark themes. Tailwind's `dark:` modifier flips between them
 * so the lockup stays legible against the page background in both modes.
 */
export function PlumoBrandRow({ size = 36, className }: PlumoBrandRowProps) {
  return (
    <span className={`inline-flex items-center ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/plumo-logo-dark.svg"
        alt="plumo"
        className="block dark:hidden w-auto"
        style={{ height: size }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/plumo-logo-white.svg"
        alt="plumo"
        className="hidden dark:block w-auto"
        style={{ height: size }}
      />
    </span>
  );
}
