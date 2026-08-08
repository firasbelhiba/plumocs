import type { CSSProperties } from 'react';

/**
 * The native form-control recipes, in one place.
 *
 * Checkbox and radio are the two controls plumo styles inline rather than
 * wrapping in a component — the browser's own box with an `accent-color` is
 * smaller, more accessible and better behaved than anything we would build.
 * "Inline" is fine; *five different inlines* is not, which is what the console
 * had: 14px and 15px boxes, no radius, no border, and two different accent
 * sources (`--primary` and `--cs-brand`, two different greens in dark mode).
 *
 * These strings are copied from the shared design system's sign-in and sign-up
 * forms, which are the specified recipe.
 */

/** `h-3.5 w-3.5` = 14px. Pair with CHECKBOX_STYLE — the border needs a colour. */
export const CHECKBOX = 'h-3.5 w-3.5 rounded-token-sm border accent-[color:var(--primary)]';

/** Tailwind cannot express `border-[color:var(--border-strong)]` on a checkbox
 *  border that preflight has already reset, so this rides as an inline style —
 *  exactly as it does in the shared library. */
export const CHECKBOX_STYLE: CSSProperties = { borderColor: 'var(--border-strong)' };

/** The row a checkbox sits in: 12px, secondary text, whole row clickable. */
export const CHECK_LABEL = 'inline-flex items-center gap-2 text-[12px] text-fg-2 cursor-pointer select-none';

/** Radio: the accent alone. Same control, same accent, no box of its own. */
export const RADIO = 'accent-[color:var(--primary)]';
