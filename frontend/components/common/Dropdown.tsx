'use client';

import React, { useState, useRef, useEffect, useContext, createContext, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lets an item close the menu it lives in.
 *
 * `isOpen` belongs to `Dropdown` and the items are `children`, so before this
 * an item had no way to reach it: picking one ran its onClick and left the menu
 * standing over the change it had just made. Every consumer either shipped that
 * or hand-rolled its own menu to avoid it.
 *
 * Deliberately a context rather than cloneElement over children: items are
 * nested inside groups and separators in real usage, and cloning only reaches
 * the top level.
 */
const DropdownCtx = createContext<{ close: () => void } | null>(null);

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  label?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'left',
  label = 'Menu',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`dropdown-menu-${Math.random().toString(36).substr(2, 9)}`).current;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-label={label}
        className="inline-flex items-center rounded focus-ring"
      >
        {trigger}
      </button>
      {isOpen && (
        <DropdownCtx.Provider value={{ close: () => setIsOpen(false) }}>
          <div
            id={menuId}
            role="menu"
            aria-orientation="vertical"
            className={cn(
              'absolute z-dropdown mt-2 min-w-[200px] bg-surface rounded-token shadow-card border border-[color:var(--border)] py-1 animate-dropdown',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {children}
          </div>
        </DropdownCtx.Provider>
      )}
    </div>
  );
};

export const DropdownItem: React.FC<{
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  /**
   * Keep the menu open after this item runs. Default false — a menu that stays
   * up over the change it just made is the behaviour being fixed here.
   *
   * The escape hatch exists for the one case where it is right: an item that
   * toggles something the reader wants to toggle several times without
   * reopening the menu each time. If you reach for it anywhere else, the item
   * probably wants to be a checkbox rather than a menu item.
   */
  keepOpen?: boolean;
}> = ({ children, onClick, variant = 'default', keepOpen = false }) => {
  const ctx = useContext(DropdownCtx);
  const handle = () => {
    onClick?.();
    // After, not before: closing first unmounts this button mid-handler, and a
    // consumer whose onClick reads event state would lose it.
    if (!keepOpen) ctx?.close();
  };
  return (
    <button
      role="menuitem"
      onClick={handle}
      className={cn(
        'block w-full text-left px-4 py-2 text-sm hover:bg-surface-2 transition-colors focus:outline-none focus-visible:bg-surface-2',
        variant === 'danger' ? 'text-[color:var(--danger)]' : 'text-fg-2',
      )}
    >
      {children}
    </button>
  );
};
