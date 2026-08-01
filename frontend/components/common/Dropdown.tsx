'use client';

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
      )}
    </div>
  );
};

export const DropdownItem: React.FC<{
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}> = ({ children, onClick, variant = 'default' }) => {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'block w-full text-left px-4 py-2 text-sm hover:bg-surface-2 transition-colors focus:outline-none focus-visible:bg-surface-2',
        variant === 'danger' ? 'text-[color:var(--danger)]' : 'text-fg-2',
      )}
    >
      {children}
    </button>
  );
};
