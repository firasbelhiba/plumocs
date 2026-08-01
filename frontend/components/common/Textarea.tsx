import React, { TextareaHTMLAttributes, forwardRef, memo, useId } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

// Memoized to prevent re-renders when parent re-renders with same props
const TextareaComponent = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-medium text-fg mb-1">
            {label}
            {props.required && <span className="text-[color:var(--danger)] ml-1">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'flex min-h-textarea w-full rounded-token-sm border bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-3',
            'border-[color:var(--border)] focus:outline-none focus:border-[color:var(--primary)] focus-ring resize-y',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2',
            error && 'border-[color:var(--danger)] focus:border-[color:var(--danger)]',
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-[11px] font-medium text-[color:var(--danger)]">{error}</p>
        )}
        {helperText && !error && <p className="mt-1 text-[11px] text-fg-3">{helperText}</p>}
      </div>
    );
  },
);

TextareaComponent.displayName = 'Textarea';

export const Textarea = memo(TextareaComponent);
