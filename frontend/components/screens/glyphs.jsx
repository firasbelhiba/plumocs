/**
 * The support-domain glyphs, inline.
 *
 * These were `<img src="/assets/icons/icon-*.svg">` until now, and every one of
 * those files hardcodes `stroke="#1E3A8A"` — PM's `--plumo-night` navy — at
 * `stroke-width="1.6"`. An `<img>` cannot inherit colour, so the rail showed
 * navy icons that never responded to hover, to the active state, or to dark
 * mode, in a green product.
 *
 * PM's nav icons are inline SVG driven by the parent through `currentColor`
 * (`Sidebar/navConfig.tsx:7`, coloured by `NavLink.tsx:45-51`); these are the
 * same shapes on the same contract. Stroke width is PM's `2`, matching every
 * other hand-drawn glyph in the tree.
 *
 * The SVG files under `public/assets/icons/` are left in place — they are still
 * the source artwork, and nothing else references them.
 */

const Glyph = ({ className = 'w-[18px] h-[18px]', children }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export const TicketGlyph = (props) => (
  <Glyph {...props}>
    <path d="M4 7 Q4 5 6 5 L18 5 Q20 5 20 7 L20 10 Q18 10 18 12 Q18 14 20 14 L20 17 Q20 19 18 19 L6 19 Q4 19 4 17 L4 14 Q6 14 6 12 Q6 10 4 10 Z" />
    <line x1="10" y1="8" x2="10" y2="16" strokeDasharray="1 2" />
  </Glyph>
);

export const ResolveGlyph = (props) => (
  <Glyph {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7 12 L11 16 L17 9" />
  </Glyph>
);

export const CustomerGlyph = (props) => (
  <Glyph {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20 Q4 14 12 14 Q20 14 20 20" />
  </Glyph>
);

export const SlaGlyph = (props) => (
  <Glyph {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8 L12 12 L15 14" />
  </Glyph>
);

/* The accent bead keeps the leaf pair it was drawn with — those two are already
   in the green palette, and only the navy outline was the defect. */
export const AgentGlyph = (props) => (
  <Glyph {...props}>
    <circle cx="12" cy="9" r="4" />
    <path d="M4 20 Q4 14 12 14 Q20 14 20 20" />
    <circle cx="18" cy="6" r="2" fill="var(--primary-soft-border)" stroke="#5A7856" />
  </Glyph>
);

export const SnoozeGlyph = (props) => (
  <Glyph {...props}>
    <path d="M18 15 A 8 8 0 1 1 9 6 A 6 6 0 0 0 18 15 Z" />
  </Glyph>
);

export const KnowledgeBaseGlyph = (props) => (
  <Glyph {...props}>
    <path d="M3 5 Q3 4 4 4 L11 4 Q12 4 12 5 L12 20 Q12 19 11 19 L4 19 Q3 19 3 20 Z" />
    <path d="M21 5 Q21 4 20 4 L13 4 Q12 4 12 5 L12 20 Q12 19 13 19 L20 19 Q21 19 21 20 Z" />
  </Glyph>
);
