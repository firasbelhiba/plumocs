import React, { InputHTMLAttributes, forwardRef, memo, useId } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// Memoized to prevent re-renders when parent re-renders with same props
const InputComponent = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-fg mb-1">
            {label}
            {props.required && <span className="text-[color:var(--danger)] ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fg-3">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            className={cn(
              'flex h-input w-full rounded-token-sm border bg-surface px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-3',
              'border-[color:var(--border)] focus:outline-none focus:border-[color:var(--primary)] focus-ring',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2',
              error && 'border-[color:var(--danger)] focus:border-[color:var(--danger)]',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              className,
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-fg-3">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1 text-[11px] font-medium text-[color:var(--danger)]">{error}</p>
        )}
        {helperText && !error && <p className="mt-1 text-[11px] text-fg-3">{helperText}</p>}
      </div>
    );
  },
);

InputComponent.displayName = 'Input';

export const Input = memo(InputComponent);
