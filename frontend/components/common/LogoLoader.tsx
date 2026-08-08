'use client';

import React from 'react';

import { PlumoAnimatedIcon } from '../brand/PlumoAnimatedIcon';

export interface LogoLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  /** The uppercase mono status line under the mark. */
  text?: string;
}

/**
 * Boot loader, from PM's `src/components/common/LogoLoader.tsx:20-147`.
 *
 * Copied from PM: the masked 48px grid wash, the `w-[260px]` stack, the
 * 44/56/72px animated brand tile, the 10px mono `tracking-[0.14em]` uppercase
 * status line with its pulsing dot, and the 4px rail driven by
 * `.plumo-loader-progress-bar` — a pure-CSS creep to 92% (`globals.css`), so
 * the bar moves from the first painted frame rather than waiting for
 * hydration, and on the GPU rather than on layout.
 *
 * The mark is `PlumoAnimatedIcon`, and that is not a detail. PM's loader has
 * two branches: a framed `primary-soft` tile holding the *tenant's uploaded*
 * loader logo, and — when no tenant uploaded one, which is every workspace by
 * default — the animated brand tile that breathes (3s) and blinks (2s). CS has
 * no tenant logos, so PM's second branch is the one that describes it; this
 * used to render the first, which meant the console booted behind a still
 * image where PM's mark is alive.
 *
 * Two deliberate differences remain. PM prints the workspace name under the
 * mark; the support console is one desk, so there is no name to disambiguate.
 * PM also has a `fullPage` variant that portals over the app; CS shows this
 * *instead of* the shell, so there is nothing to portal above.
 */
export const LogoLoader: React.FC<LogoLoaderProps> = ({
  size = 'md',
  text = 'opening your desk',
}) => {
  const tileSize = { sm: 44, md: 56, lg: 72 }[size];

  return (
    <div className="relative flex items-center justify-center min-h-[60vh]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.35,
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col items-center gap-3 w-[260px]">
        <PlumoAnimatedIcon size={tileSize} />

        <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium tracking-[0.14em] uppercase text-fg-3 mt-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--primary)' }}
          />
          {text}…
        </div>

        <div className="w-full mt-1">
          <div
            className="w-full h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-3)' }}
            role="progressbar"
            aria-label={text}
            aria-busy="true"
          >
            <div
              className="plumo-loader-progress-bar h-full w-full rounded-full"
              style={{ background: 'var(--primary)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogoLoader;
