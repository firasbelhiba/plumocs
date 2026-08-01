import React from 'react';

interface ProgressProps {
  value: number;
  color?: string;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, color, className }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`w-full h-1.5 rounded-full overflow-hidden ${className ?? ''}`}
      style={{ background: 'var(--surface-3)' }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[var(--dur-slow)] ease-[cubic-bezier(0.2,0,0,1)]"
        style={{ width: `${clamped}%`, background: color ?? 'var(--primary)' }}
      />
    </div>
  );
};

export default Progress;
