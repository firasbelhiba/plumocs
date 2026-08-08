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
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  /**
   * Escape closes, from anywhere inside — trigger or item.
   *
   * It used to be bound to the trigger button, and the menu is a *sibling* of
   * that button rather than a child of it, so a keydown raised on an item never
   * reached the handler: Escape worked while focus still sat on the trigger and
   * did nothing once the reader had tabbed into the list. Every hand-rolled
   * panel this component replaces was dismissible with Escape from anywhere,
   * because the console dismissed them from one window listener — so binding it
   * on the wrapper is what keeps a conversion faithful instead of quietly
   * narrowing it.
   *
   * Focus goes back to the trigger afterwards. The menu unmounts on close, and
   * without this the focused element goes with it: the reader is dropped onto
   * <body> and has to tab back through the page to where they were.
   */
  const handleWrapperKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Enter and Space stay on the trigger: `preventDefault` here is what stops
  // the browser also synthesising a click and toggling the menu twice.
  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleWrapperKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
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
  /**
   * Marks this row as the value currently in force, for the menus that pick
   * one-of-N rather than fire an action.
   *
   * Every hand-rolled picker this component replaced tinted its current row —
   * status, priority, team and the queue's sort order all rendered
   * `data-on={String(o.on)}` against the `--cs-onbg/onfg/onw` token trio. The
   * conversion dropped the tint and kept the flag: `statusOptions`,
   * `prioOptions`, `teamList` and `sortOptions` still compute `.on` every
   * render and nothing read it, so all four menus opened with no indication of
   * where you already were. This is that indication, back in the primitive so
   * the next picker gets it for free.
   *
   * Passing it at all is the claim that this row is one option among
   * alternatives, which is what `menuitemradio` means — so the state reaches a
   * screen reader too, where `data-on` never did. Leave it undefined for an
   * action row and the item stays a plain `menuitem`.
   */
  selected?: boolean;
}> = ({ children, onClick, variant = 'default', keepOpen = false, selected }) => {
  const ctx = useContext(DropdownCtx);
  const handle = () => {
    onClick?.();
    // After, not before: closing first unmounts this button mid-handler, and a
    // consumer whose onClick reads event state would lose it.
    if (!keepOpen) ctx?.close();
  };
  const isOption = selected !== undefined;
  return (
    <button
      role={isOption ? 'menuitemradio' : 'menuitem'}
      aria-checked={isOption ? selected : undefined}
      onClick={handle}
      className={cn(
        'block w-full text-left px-4 py-2 text-sm hover:bg-surface-2 transition-colors focus:outline-none focus-visible:bg-surface-2',
        // One branch rather than a layer over the base: `twMerge` would have to
        // pick a winner between `text-fg-2` and an arbitrary-value text colour
        // to get here, and it does not reliably read a custom scale name as a
        // colour. Same recipe as `Ticket.jsx`'s `ON_ROW`, which is what the
        // assignee picker still uses for its own current row.
        selected
          ? 'bg-[color:var(--primary-soft)] text-[color:var(--primary)] font-medium'
          : variant === 'danger'
            ? 'text-[color:var(--danger)]'
            : 'text-fg-2',
      )}
    >
      {children}
    </button>
  );
};
