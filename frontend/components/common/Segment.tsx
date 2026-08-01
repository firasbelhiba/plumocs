import React, { ReactNode } from 'react';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentProps<T>) {
  return (
    <div
      className={`inline-flex p-0.5 bg-surface-2 border rounded-token-sm ${className ?? ''}`}
      style={{ borderColor: 'var(--border)' }}
      role="tablist"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`h-[calc(24px*var(--density))] px-2.5 text-[12px] font-medium rounded-token-sm transition-colors flex items-center gap-1 ${
              active ? 'bg-surface text-fg shadow-card' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segment;
