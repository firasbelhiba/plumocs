'use client';

import React, { ReactNode, useEffect } from 'react';
import { useBodyScrollLock } from '@/hooks';
import { Icon } from './Icon';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Small mono eyebrow over the title — PM's drawer header always has one. */
  eyebrow?: string;
  title?: string;
  /** Used when there is no `title` to name the dialog for assistive tech. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Right-side drawer, generalised from PM's canonical one
 * (`src/components/dashboard/DayDetailDrawer.tsx:73-118`) — the newer,
 * token-driven of PM's two drawer mechanisms.
 *
 * Everything below is PM's: the backdrop's lighter `backdrop-blur-[1px]` (the
 * modal's is `backdrop-blur-sm`), the `w-full sm:w-[420px]` panel at `z-modal`
 * with a left border and `shadow-modal`, the 48px header with a 10px mono
 * uppercase eyebrow over a 14px semibold title and a 16px close glyph, and the
 * `flex-1 overflow-y-auto` body. Escape closes via a window keydown, the
 * backdrop closes on click, and the body scroll lock is the shared hook.
 */
export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  eyebrow,
  title,
  ariaLabel,
  children,
}) => {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-modal-backdrop bg-black/40 backdrop-blur-[1px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? ariaLabel}
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] z-modal bg-surface border-l flex flex-col shadow-modal animate-slide-in-right"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="px-4 h-12 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] font-mono font-medium tracking-[0.14em] text-fg-3 uppercase">
                {eyebrow}
              </div>
            )}
            {title && <div className="text-[14px] font-semibold text-fg truncate">{title}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-fg-2 hover:bg-surface-2 hover:text-fg rounded-token-sm transition-colors"
            aria-label="Close"
          >
            <Icon name="state-close" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

export default Drawer;
