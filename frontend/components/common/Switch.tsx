import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Applied to the 44×24 track wrapper, not to the hidden input. */
  className?: string;
}

/**
 * An on/off switch — for a setting that takes effect the moment it is flipped.
 *
 * A checkbox says "this will be true when you save"; a switch says "this is on
 * now". Settings rows that write immediately were using checkboxes, which read
 * as a form that had lost its save button.
 *
 * 44×24 track, 20px knob, `--surface-3` off and `--primary` on, white knob — the
 * majority geometry in the shared library, with the focus ring from the `peer`
 * treatment used by the rows there that have one.
 *
 * MUST sit inside a `<label>`: the input is `sr-only`, so the label ancestor is
 * what makes the track clickable. This wrapper is deliberately NOT a label
 * itself — the shared library puts the label either on the whole row (with the
 * switch a plain box, the shape used here) or around the switch alone, and
 * nesting one inside the other is invalid HTML that double-fires the toggle.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, disabled, ...props }, ref) => (
    <span
      className={cn(
        'relative inline-block w-11 h-6 shrink-0',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />
      <span className="absolute inset-0 rounded-full bg-surface-3 transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[color:var(--ring)] peer-checked:bg-[color:var(--primary)]" />
      <span className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  ),
);

Switch.displayName = 'Switch';
