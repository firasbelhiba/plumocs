import React, { SelectHTMLAttributes, forwardRef, memo, useId } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

// Memoized to prevent re-renders when parent re-renders with same props
const SelectComponent = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, children, value, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-fg mb-1">
            {label}
            {props.required && <span className="text-[color:var(--danger)] ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            className={cn(
              'appearance-none flex h-input w-full rounded-token-sm border bg-surface pl-2.5 pr-8 py-1.5 text-[13px] text-fg',
              'border-[color:var(--border)] focus:outline-none focus:border-[color:var(--primary)] focus-ring',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2',
              error && 'border-[color:var(--danger)] focus:border-[color:var(--danger)]',
              className,
            )}
            ref={ref}
            value={value ?? ''}
            {...props}
          >
            {props.placeholder && (
              <option value="" disabled>
                {props.placeholder}
              </option>
            )}
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <Icon
            name="state-caret"
            size={14}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-3"
          />
        </div>
        {error && (
          <p className="mt-1 text-[11px] font-medium text-[color:var(--danger)]">{error}</p>
        )}
        {helperText && !error && <p className="mt-1 text-[11px] text-fg-3">{helperText}</p>}
      </div>
    );
  },
);

SelectComponent.displayName = 'Select';

export const Select = memo(SelectComponent);
