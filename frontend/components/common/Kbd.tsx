import React, { ReactNode } from 'react';

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className }) => (
  <kbd
    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 font-mono text-[10px] text-fg-2 bg-surface border rounded-token-sm ${className ?? ''}`}
    style={{ borderColor: 'var(--border)' }}
  >
    {children}
  </kbd>
);

export default Kbd;
