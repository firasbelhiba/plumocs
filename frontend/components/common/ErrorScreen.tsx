'use client';

import React from 'react';
import { Button } from './Button';

interface ErrorScreenAction {
  label: string;
  onClick: () => void;
  variant?: React.ComponentProps<typeof Button>['variant'];
}

interface ErrorScreenProps {
  /** Path under /public for the illustration. Animated SVGs render via <img>
      so the runtime <animate>/<animateTransform> elements keep working. */
  illustration: string;
  /** Optional small badge above the title (e.g. "500", "404"). */
  badge?: string;
  title: string;
  description: React.ReactNode;
  primaryAction?: ErrorScreenAction;
  secondaryAction?: ErrorScreenAction;
  /** Optional dev-only details panel (collapsed by default). */
  details?: string;
  /** When true (default), wraps in a min-h-screen container — used by the
      root-level 404 / 500 pages where there's no shell. Set to false when
      rendering inside an authenticated workspace layout so the sidebar
      stays visible and the error sits inside the page-content area. */
  fullScreen?: boolean;
}

// Full-viewport plumo error / empty surface. Reused by app/error.tsx,
// global-error.tsx, and future 404 / forbidden / offline pages so the
// blob illustration framing stays consistent everywhere.
export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  illustration,
  badge,
  title,
  description,
  primaryAction,
  secondaryAction,
  details,
  fullScreen = true,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  const wrapperClass = fullScreen
    ? 'min-h-screen flex items-center justify-center px-6 py-12'
    : 'flex items-center justify-center px-6 py-12 min-h-[calc(100vh-8rem)]';

  return (
    <div className={wrapperClass} style={fullScreen ? { background: 'var(--bg)' } : undefined}>
      <div
        className="w-full max-w-[480px] bg-surface rounded-token border p-8 text-center"
        style={{ borderColor: 'var(--border)' }}
      >
        {badge && (
          <div className="mb-4 flex justify-center">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-token-sm text-[11px] font-mono font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              {badge}
            </span>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <img src={illustration} alt="" width={360} height={240} className="max-w-full h-auto" />
        </div>

        <h1 className="text-[22px] font-semibold tracking-tight text-fg mb-2">{title}</h1>
        <p className="text-[13px] text-fg-2 leading-relaxed max-w-[360px] mx-auto">{description}</p>

        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            {primaryAction && (
              <Button variant={primaryAction.variant ?? 'primary'} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant={secondaryAction.variant ?? 'outline'}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}

        {details && (
          <div className="mt-6 text-left">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-[11px] font-mono text-fg-3 hover:text-fg-2 transition-colors"
            >
              {showDetails ? '▼' : '▶'} Error details
            </button>
            {showDetails && (
              <pre
                className="mt-2 px-3 py-2 rounded-token-sm text-[11px] font-mono text-fg-2 overflow-x-auto whitespace-pre-wrap break-words"
                style={{ background: 'var(--surface-2)' }}
              >
                {details}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorScreen;
