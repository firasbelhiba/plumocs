'use client';

import React, { ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useBodyScrollLock } from '@/hooks';
import { Icon } from './Icon';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  ariaLabel?: string;
}

const sizeClasses = {
  sm: 'max-w-[calc(100%-2rem)] sm:max-w-md',
  md: 'max-w-[calc(100%-2rem)] sm:max-w-lg',
  lg: 'max-w-[calc(100%-2rem)] sm:max-w-2xl',
  xl: 'max-w-[calc(100%-2rem)] sm:max-w-4xl',
  full: 'max-w-[calc(100%-2rem)] sm:max-w-full sm:mx-4',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  ariaLabel,
}) => {
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use the scroll lock hook to prevent race conditions with multiple modals
  useBodyScrollLock(isOpen);

  // Focus trap and restoration
  useEffect(() => {
    if (isOpen) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal after a short delay to ensure it's rendered
      const timer = setTimeout(() => {
        modalRef.current?.focus();
      }, 10);

      return () => clearTimeout(timer);
    } else if (previousActiveElement.current) {
      // Restore focus when modal closes
      previousActiveElement.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events for focus trapping and escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !modalRef.current) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !mounted) return null;

  const titleId = title ? 'modal-title' : undefined;

  const modalContent = (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className={cn(
          'relative bg-surface border border-[color:var(--border)] rounded-token shadow-modal w-full outline-none animate-modal-in',
          sizeClasses[size],
          'max-h-[90vh] flex flex-col',
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-[color:var(--border)]">
            <h2 id={titleId} className="text-sm sm:text-base font-semibold text-fg">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-fg-3 hover:text-fg transition-colors p-1 rounded focus-ring"
            >
              <Icon name="state-close" size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-3 sm:px-4 py-2 sm:py-3 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-3 sm:px-4 py-2 sm:py-3 border-t border-[color:var(--border)] bg-surface-2 rounded-b-token">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Use portal to render modal outside of any scaled containers
  return createPortal(modalContent, document.body);
};
