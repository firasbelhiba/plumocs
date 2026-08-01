import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-all duration-[var(--dur-fast)] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] focus-ring disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--primary)] text-[color:var(--primary-fg)] hover:bg-[color:var(--primary-hover)]',
        primary:
          'bg-[color:var(--primary)] text-[color:var(--primary-fg)] hover:bg-[color:var(--primary-hover)]',
        secondary: 'bg-surface-2 text-fg border border-[color:var(--border)] hover:bg-surface-3',
        success: 'text-white hover:brightness-110 bg-[color:var(--success)]',
        warning: 'text-white hover:brightness-110 bg-[color:var(--warning)]',
        danger: 'text-white hover:brightness-110 bg-[color:var(--danger)]',
        outline:
          'border border-[color:var(--border-strong)] text-fg bg-transparent hover:bg-surface-2',
        ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
        link: 'underline-offset-2 hover:underline text-[color:var(--primary)] px-0 h-auto',
      },
      size: {
        sm: 'h-btn-sm px-2.5 text-xs gap-1.5',
        md: 'h-btn-md px-3 text-[13px] gap-1.5',
        lg: 'h-btn-lg px-4 text-sm gap-2',
        icon: 'h-btn-md w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading, leftIcon, rightIcon, children, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';

// Exported for the support console's Settings pane, which reuses the recipe
// so its bespoke controls stay pixel-identical to <Button>. Additive only —
// the component's behaviour is unchanged from the shared original.
export { buttonVariants };
