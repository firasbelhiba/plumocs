'use client';

/* Ports of the Plumo Design System core components used by the console
 * (Button, Badge, Pill) — from the DS bundle. */

const BTN_VARIANT = {
  primary: { background: 'var(--plumo-blue)', color: 'var(--plumo-white)' },
  soft: { background: 'var(--plumo-mist)', color: 'var(--plumo-night)' },
  ghost: { background: 'transparent', color: 'var(--plumo-dark)' },
  warm: { background: 'var(--plumo-night)', color: 'var(--plumo-peach)' },
};

export function Button({ children, variant = 'primary', size = 'md', arrow = false, href, disabled = false, onClick, type = 'button', style, ...rest }) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: size === 'sm' ? '9px 16px' : '12px 22px',
    borderRadius: 'var(--plumo-radius-pill)',
    fontFamily: 'inherit',
    fontSize: size === 'sm' ? 14 : 15,
    fontWeight: 500,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    lineHeight: 1.2,
    transition:
      'transform var(--plumo-dur-default) var(--plumo-ease), background var(--plumo-dur-default) var(--plumo-ease), color var(--plumo-dur-default) var(--plumo-ease), box-shadow var(--plumo-dur-default) var(--plumo-ease)',
    ...BTN_VARIANT[variant],
    ...style,
  };
  const inner = (
    <>
      {children}
      {arrow && <span aria-hidden="true">→</span>}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} style={baseStyle} onClick={onClick} {...rest}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} style={baseStyle} disabled={disabled} onClick={onClick} {...rest}>
      {inner}
    </button>
  );
}

const BADGE_TONE = {
  new: { background: 'var(--plumo-butter)', color: 'var(--plumo-on-butter)' },
  blue: { background: 'var(--plumo-mist)', color: 'var(--plumo-blue)' },
  peach: { background: 'var(--plumo-peach)', color: 'var(--plumo-on-peach)' },
  neutral: { background: 'var(--plumo-canvas)', color: 'var(--plumo-muted)', boxShadow: '0 0 0 1px var(--plumo-border)' },
};

export function Badge({ children, tone = 'new', style, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--plumo-radius-pill)',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
        ...BADGE_TONE[tone],
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

const PILL_TONE = {
  mist: { background: 'var(--plumo-mist)', color: 'var(--plumo-night)' },
  peach: { background: 'var(--plumo-peach)', color: 'var(--plumo-on-peach)' },
  butter: { background: 'var(--plumo-butter)', color: 'var(--plumo-on-butter)' },
  white: { background: 'var(--plumo-white)', color: 'var(--plumo-night)', boxShadow: 'var(--plumo-shadow-card)' },
};

export function Pill({ children, tone = 'mist', dot = false, icon, style, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        borderRadius: 'var(--plumo-radius-pill)',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...PILL_TONE[tone],
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--plumo-butter)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {typeof dot === 'string' ? dot : ''}
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}
